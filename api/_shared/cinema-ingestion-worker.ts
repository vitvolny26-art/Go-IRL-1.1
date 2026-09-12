import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env.js";
import { getCinemaAdapter } from "./cinema-adapters/premiere-cz.js";
import type {
  CinemaRawSnapshotPayload,
  CinemaSourceConfig,
} from "./cinema-ingestion-types.js";

type CinemaJobType = "FETCH" | "PARSE" | "RESOLVE" | "SYNC";

type CinemaIngestionJob = {
  id: string;
  job_type: string;
  source_config_id: string | null;
  snapshot_id: string | null;
  parse_run_id: string | null;
  attempt: number;
  max_attempts: number;
  payload: Record<string, unknown>;
};

type CinemaParseRun = {
  id: string;
  snapshot_id: string;
  source_config_id: string;
  status: string;
  records_valid: number;
  scope_complete: boolean;
};

type StagingRow = {
  id: string;
  external_movie_id: string | null;
  movie_fingerprint: string | null;
  title: string | null;
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
  external_screening_id: string | null;
  screening_fingerprint: string | null;
  starts_at_local: string | null;
  normalized_payload: Record<string, unknown>;
};

type MovieCandidate = {
  id: string;
  title: string;
  original_title: string | null;
  release_year: number | null;
  duration_minutes: number | null;
};

const processableJobTypes: CinemaJobType[] = ["FETCH", "PARSE", "RESOLVE", "SYNC"];

const adminClient = () => createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const compactError = (error: unknown) => {
  if (!(error instanceof Error)) return "unknown_error";
  return error.message.replace(/[^A-Za-z0-9:_./ -]/g, "").slice(0, 500) || error.name;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const normalizeTitle = (value: string | null | undefined) => (value || "")
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const retryDelayMinutes = (attempt: number) => Math.min(360, 5 * 2 ** Math.max(0, attempt - 1));

const loadSource = async (db: SupabaseClient, id: string) => {
  const { data, error } = await db.from("cinema_sources").select("*").eq("id", id).single();
  if (error || !data) throw new Error(`cinema_source_load_failed:${error?.code || "not_found"}`);
  return data as CinemaSourceConfig & { consecutive_failures: number };
};

const enqueue = async (
  db: SupabaseClient,
  values: {
    job_type: string;
    source_config_id?: string | null;
    snapshot_id?: string | null;
    parse_run_id?: string | null;
    dedupe_key: string;
    payload?: Record<string, unknown>;
    priority?: number;
  },
) => {
  const { error } = await db.from("cinema_ingestion_jobs").insert({
    priority: 100,
    payload: {},
    ...values,
  });
  if (error && error.code !== "23505") throw new Error(`cinema_job_enqueue_failed:${error.code}`);
};

const finishJob = async (
  db: SupabaseClient,
  job: CinemaIngestionJob,
  success: boolean,
  result: Record<string, unknown> = {},
  errorMessage: string | null = null,
  retryMinutes: number | null = null,
) => {
  const { error } = await db.rpc("cinema_finish_ingestion_job", {
    p_job_id: job.id,
    p_success: success,
    p_result: result,
    p_error_message: errorMessage,
    p_retry_after_minutes: retryMinutes,
  });
  if (error) throw new Error(`cinema_job_finish_failed:${error.code}`);
};

const processFetch = async (db: SupabaseClient, job: CinemaIngestionJob) => {
  if (!job.source_config_id) throw new Error("cinema_fetch_missing_source_config");
  const source = await loadSource(db, job.source_config_id);
  if (!source.enabled) {
    await finishJob(db, job, true, { skipped: "source_disabled" });
    return;
  }

  const adapter = getCinemaAdapter(source.adapter_key);
  const payload = await adapter.fetchSnapshot(source);
  const rawJson = JSON.stringify(payload);
  const fetchStatus = payload.pages.length === 0
    ? "failed"
    : payload.failures.length > 0 ? "partial" : "fetched";
  const httpStatus = payload.pages[0]?.status ?? null;
  const contentHash = `sha256:${sha256(rawJson)}`;

  const { data: snapshot, error: insertError } = await db
    .from("cinema_source_snapshots")
    .insert({
      source_config_id: source.id,
      venue_id: source.venue_id,
      source_id: source.source_id,
      source_url: payload.root_url,
      fetched_at: payload.fetched_at,
      http_status: httpStatus,
      fetch_status: fetchStatus,
      raw_format: "json",
      raw_payload: payload,
      content_hash: contentHash,
      parser_version: source.parser_version,
      error_message: payload.failures.length ? payload.failures.map((v) => `${v.url}:${v.error}`).join(" | ").slice(0, 2000) : null,
      metadata: {
        worker_job_id: job.id,
        adapter_key: source.adapter_key,
        fetched_pages: payload.pages.length,
        fetch_failures: payload.failures.length,
      },
    })
    .select("id")
    .single();
  if (insertError || !snapshot) throw new Error(`cinema_snapshot_insert_failed:${insertError?.code || "unknown"}`);

  await enqueue(db, {
    job_type: "ARCHIVE_DRIVE",
    source_config_id: source.id,
    snapshot_id: snapshot.id,
    dedupe_key: `archive-drive:${snapshot.id}`,
    payload: { content_hash: contentHash },
    priority: 50,
  });

  if (fetchStatus !== "failed") {
    await enqueue(db, {
      job_type: "PARSE",
      source_config_id: source.id,
      snapshot_id: snapshot.id,
      dedupe_key: `parse:${snapshot.id}:${source.parser_version}`,
      payload: { content_hash: contentHash },
      priority: 70,
    });
  }

  if (fetchStatus === "fetched") {
    await db.from("cinema_sources").update({ consecutive_failures: 0 }).eq("id", source.id);
    await finishJob(db, job, true, {
      snapshot_id: snapshot.id,
      content_hash: contentHash,
      pages: payload.pages.length,
    });
    return;
  }

  await db.from("cinema_sources").update({
    consecutive_failures: Number(source.consecutive_failures || 0) + 1,
  }).eq("id", source.id);

  const message = fetchStatus === "failed" ? "cinema_fetch_failed" : "cinema_fetch_partial";
  await finishJob(
    db,
    job,
    false,
    { snapshot_id: snapshot.id, content_hash: contentHash, pages: payload.pages.length },
    message,
    retryDelayMinutes(job.attempt),
  );
};

const processParse = async (db: SupabaseClient, job: CinemaIngestionJob) => {
  if (!job.source_config_id || !job.snapshot_id) throw new Error("cinema_parse_missing_identity");
  const source = await loadSource(db, job.source_config_id);
  const { data: snapshot, error: snapshotError } = await db
    .from("cinema_source_snapshots")
    .select("id,raw_payload,fetch_status")
    .eq("id", job.snapshot_id)
    .single();
  if (snapshotError || !snapshot?.raw_payload) throw new Error(`cinema_snapshot_load_failed:${snapshotError?.code || "missing_payload"}`);

  const adapter = getCinemaAdapter(source.adapter_key);
  const parsed = adapter.parseSnapshot(source, snapshot.raw_payload as CinemaRawSnapshotPayload);
  const status = parsed.scope_complete ? "success" : "quarantined";

  const { data: parseRun, error: parseError } = await db
    .from("cinema_parse_runs")
    .upsert({
      snapshot_id: job.snapshot_id,
      source_config_id: source.id,
      adapter_key: source.adapter_key,
      parser_version: source.parser_version,
      status,
      completed_at: new Date().toISOString(),
      records_parsed: parsed.records_parsed,
      records_valid: parsed.records_valid,
      records_rejected: parsed.records_rejected,
      min_schedule_date: parsed.min_schedule_date,
      max_schedule_date: parsed.max_schedule_date,
      expected_until: parsed.expected_until,
      fetch_complete: parsed.fetch_complete,
      parser_complete: parsed.parser_complete,
      scope_complete: parsed.scope_complete,
      fatal_error: parsed.fatal_error,
      zero_result: parsed.zero_result,
      error_message: parsed.errors.length ? parsed.errors.join(" | ").slice(0, 4000) : null,
      metrics: parsed.metrics,
    }, { onConflict: "snapshot_id,parser_version" })
    .select("id")
    .single();
  if (parseError || !parseRun) throw new Error(`cinema_parse_run_upsert_failed:${parseError?.code || "unknown"}`);

  if (parsed.rows.length) {
    const stagingRows = parsed.rows.map((row, index) => ({
      parse_run_id: parseRun.id,
      source_config_id: source.id,
      row_no: index + 1,
      external_screening_id: row.external_screening_id,
      screening_fingerprint: row.screening_fingerprint,
      external_movie_id: row.external_movie_id,
      movie_fingerprint: row.movie_fingerprint,
      title: row.title,
      original_title: row.original_title,
      release_year: row.release_year,
      duration_minutes: row.duration_minutes,
      starts_at_local: row.starts_at_local,
      timezone: row.timezone,
      normalized_payload: row,
      validation_errors: [],
      safe_to_write: false,
      sync_status: "pending",
    }));
    const { error } = await db.from("cinema_screening_staging")
      .upsert(stagingRows, { onConflict: "parse_run_id,row_no" });
    if (error) throw new Error(`cinema_staging_upsert_failed:${error.code}`);
  }

  if (parsed.scope_complete) {
    await enqueue(db, {
      job_type: "RESOLVE",
      source_config_id: source.id,
      snapshot_id: job.snapshot_id,
      parse_run_id: parseRun.id,
      dedupe_key: `resolve:${parseRun.id}`,
      priority: 80,
    });
  }

  await finishJob(db, job, true, {
    parse_run_id: parseRun.id,
    status,
    records_valid: parsed.records_valid,
    scope_complete: parsed.scope_complete,
    expected_until: parsed.expected_until,
    max_schedule_date: parsed.max_schedule_date,
  });
};

const exactSourceMapping = async (
  db: SupabaseClient,
  sourceId: string,
  externalMovieId: string,
) => {
  const { data, error } = await db.from("cinema_movie_sources")
    .select("movie_id")
    .eq("source_id", sourceId)
    .eq("external_movie_id", externalMovieId)
    .maybeSingle();
  if (error) throw new Error(`cinema_movie_source_lookup_failed:${error.code}`);
  return data?.movie_id as string | undefined;
};

const persistSourceMapping = async (
  db: SupabaseClient,
  sourceId: string,
  externalMovieId: string,
  movieId: string,
  sourceUrl: string | null,
) => {
  const { error } = await db.from("cinema_movie_sources").insert({
    movie_id: movieId,
    source_id: sourceId,
    external_movie_id: externalMovieId,
    source_url: sourceUrl,
  });
  if (!error) return movieId;
  if (error.code !== "23505") throw new Error(`cinema_movie_source_insert_failed:${error.code}`);
  return (await exactSourceMapping(db, sourceId, externalMovieId)) || movieId;
};

const resolveMovie = async (
  db: SupabaseClient,
  source: CinemaSourceConfig,
  row: StagingRow,
): Promise<{ movieId?: string; error?: string }> => {
  if (!row.external_movie_id || !row.movie_fingerprint || !row.title) return { error: "movie_identity_missing" };

  const mapped = await exactSourceMapping(db, source.source_id, row.external_movie_id);
  if (mapped) return { movieId: mapped };

  const { data: fingerprintMovie, error: fpError } = await db.from("cinema_movies")
    .select("id")
    .eq("movie_fingerprint", row.movie_fingerprint)
    .maybeSingle();
  if (fpError) throw new Error(`cinema_movie_fingerprint_lookup_failed:${fpError.code}`);
  if (fingerprintMovie?.id) {
    return { movieId: await persistSourceMapping(
      db,
      source.source_id,
      row.external_movie_id,
      fingerprintMovie.id,
      typeof row.normalized_payload.source_url === "string" ? row.normalized_payload.source_url : null,
    ) };
  }

  if (row.release_year) {
    const { data: candidates, error } = await db.from("cinema_movies")
      .select("id,title,original_title,release_year,duration_minutes")
      .eq("release_year", row.release_year)
      .limit(100);
    if (error) throw new Error(`cinema_movie_fallback_lookup_failed:${error.code}`);
    const expectedTitles = new Set([normalizeTitle(row.title), normalizeTitle(row.original_title)].filter(Boolean));
    const matches = (candidates as MovieCandidate[] || []).filter((candidate) => {
      const candidateTitles = [normalizeTitle(candidate.title), normalizeTitle(candidate.original_title)];
      const titleMatch = candidateTitles.some((title) => title && expectedTitles.has(title));
      if (!titleMatch) return false;
      if (!row.duration_minutes || !candidate.duration_minutes) return true;
      return Math.abs(row.duration_minutes - candidate.duration_minutes) <= 15;
    });
    if (matches.length === 1) {
      return { movieId: await persistSourceMapping(
        db,
        source.source_id,
        row.external_movie_id,
        matches[0].id,
        typeof row.normalized_payload.source_url === "string" ? row.normalized_payload.source_url : null,
      ) };
    }
    if (matches.length > 1) return { error: "ambiguous_movie_match" };
  }

  const { data: movieId, error } = await db.rpc("cinema_resolve_or_create_movie", {
    p_source_id: source.source_id,
    p_external_movie_id: row.external_movie_id,
    p_title: row.title,
    p_movie_fingerprint: row.movie_fingerprint,
    p_original_title: row.original_title,
    p_release_year: row.release_year,
    p_duration_minutes: row.duration_minutes,
    p_source_url: typeof row.normalized_payload.source_url === "string" ? row.normalized_payload.source_url : null,
  });
  if (error || !movieId) throw new Error(`cinema_movie_create_resolver_failed:${error?.code || "no_movie_id"}`);
  return { movieId: movieId as string };
};

const processResolve = async (db: SupabaseClient, job: CinemaIngestionJob) => {
  if (!job.source_config_id || !job.parse_run_id) throw new Error("cinema_resolve_missing_identity");
  const source = await loadSource(db, job.source_config_id);
  const { data: parseRunData, error: parseRunError } = await db.from("cinema_parse_runs")
    .select("id,snapshot_id,source_config_id,status,records_valid,scope_complete")
    .eq("id", job.parse_run_id)
    .single();
  if (parseRunError || !parseRunData) throw new Error(`cinema_parse_run_load_failed:${parseRunError?.code || "not_found"}`);
  const parseRun = parseRunData as CinemaParseRun;
  if (!parseRun.scope_complete || parseRun.status !== "success") {
    await finishJob(db, job, true, { skipped: "parse_run_not_complete" });
    return;
  }

  const { data: rowsData, error: rowsError } = await db.from("cinema_screening_staging")
    .select("id,external_movie_id,movie_fingerprint,title,original_title,release_year,duration_minutes,external_screening_id,screening_fingerprint,starts_at_local,normalized_payload")
    .eq("parse_run_id", parseRun.id)
    .order("row_no");
  if (rowsError) throw new Error(`cinema_staging_load_failed:${rowsError.code}`);
  const rows = rowsData as StagingRow[];
  if (!rows.length || rows.length !== parseRun.records_valid) throw new Error("cinema_staging_count_mismatch");

  const cache = new Map<string, { movieId?: string; error?: string }>();
  let unresolved = 0;
  for (const row of rows) {
    const key = `${row.external_movie_id || ""}|${row.movie_fingerprint || ""}`;
    let resolved = cache.get(key);
    if (!resolved) {
      resolved = await resolveMovie(db, source, row);
      cache.set(key, resolved);
    }
    const identitySafe = Boolean(row.external_screening_id || row.screening_fingerprint);
    const safe = Boolean(resolved.movieId && row.starts_at_local && identitySafe);
    const { error } = await db.from("cinema_screening_staging").update({
      movie_id: resolved.movieId || null,
      safe_to_write: safe,
      sync_status: safe ? "resolved" : "rejected",
      validation_errors: safe ? [] : [resolved.error || "screening_not_safe_to_write"],
    }).eq("id", row.id);
    if (error) throw new Error(`cinema_staging_resolve_update_failed:${error.code}`);
    if (!safe) unresolved += 1;
  }

  if (unresolved > 0) {
    await db.from("cinema_parse_runs").update({
      status: "quarantined",
      error_message: `movie_resolution_incomplete:${unresolved}`,
    }).eq("id", parseRun.id);
    await finishJob(db, job, true, { parse_run_id: parseRun.id, unresolved, quarantined: true });
    return;
  }

  await enqueue(db, {
    job_type: "SYNC",
    source_config_id: source.id,
    snapshot_id: parseRun.snapshot_id,
    parse_run_id: parseRun.id,
    dedupe_key: `sync:${parseRun.id}`,
    priority: 90,
  });
  await finishJob(db, job, true, { parse_run_id: parseRun.id, resolved: rows.length });
};

const processSync = async (db: SupabaseClient, job: CinemaIngestionJob) => {
  if (!job.parse_run_id) throw new Error("cinema_sync_missing_parse_run");
  const { data: syncRunId, error } = await db.rpc("cinema_apply_parse_run", {
    p_parse_run_id: job.parse_run_id,
  });
  if (error || !syncRunId) throw new Error(`cinema_atomic_sync_failed:${error?.code || "no_sync_run_id"}`);
  await finishJob(db, job, true, { parse_run_id: job.parse_run_id, sync_run_id: syncRunId });
};

const processJob = async (db: SupabaseClient, job: CinemaIngestionJob) => {
  switch (job.job_type) {
    case "FETCH": return processFetch(db, job);
    case "PARSE": return processParse(db, job);
    case "RESOLVE": return processResolve(db, job);
    case "SYNC": return processSync(db, job);
    default: throw new Error(`cinema_worker_unsupported_job:${job.job_type}`);
  }
};

export type CinemaWorkerSummary = {
  claimed: number;
  succeeded: number;
  retriedOrFailed: number;
  durationMs: number;
};

export async function runCinemaIngestionWorkerBatch(options: {
  workerId?: string;
  limit?: number;
  db?: SupabaseClient;
} = {}): Promise<CinemaWorkerSummary> {
  const started = Date.now();
  const db = options.db || adminClient();
  const workerId = options.workerId || `cinema-worker:${process.pid}`;
  const { data, error } = await db.rpc("cinema_claim_ingestion_jobs", {
    p_worker: workerId,
    p_limit: Math.max(1, Math.min(options.limit ?? 10, 100)),
    p_job_types: processableJobTypes,
  });
  if (error) throw new Error(`cinema_job_claim_failed:${error.code}`);
  const jobs = (data || []) as CinemaIngestionJob[];
  const summary: CinemaWorkerSummary = { claimed: jobs.length, succeeded: 0, retriedOrFailed: 0, durationMs: 0 };

  for (const job of jobs) {
    try {
      await processJob(db, job);
      summary.succeeded += 1;
    } catch (error) {
      const message = compactError(error);
      try {
        await finishJob(db, job, false, {}, message, retryDelayMinutes(job.attempt));
      } catch (finishError) {
        console.error("cinema_worker_finish_error", { jobId: job.id, code: compactError(finishError) });
      }
      summary.retriedOrFailed += 1;
    }
  }

  summary.durationMs = Date.now() - started;
  return summary;
}
