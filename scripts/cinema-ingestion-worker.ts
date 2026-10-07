import "../api/_shared/cinema-adapters/register.js";
import { cinemaAdapters } from "../api/_shared/cinema-adapters/premiere-cz.js";
import type { CinemaSourceConfig } from "../api/_shared/cinema-ingestion-types.js";
import { createClient } from "@supabase/supabase-js";
import { persistDailyMovieCityCandidates } from "../api/_shared/cinema-daily-candidate-persistence.js";
import { finalizeDailyCinemaCandidatePublication, materializeApprovedDailyCinemaCandidate, resetDailyCinemaCandidateAfterProviderFailure } from "../api/_shared/cinema-daily-candidate-publication.js";
import { readEnv, requireEnv } from "../api/_shared/env.js";
import { loadDailyMovieCityCandidates } from "../api/_shared/cinema-daily-candidate-runtime.js";
import {
  enqueueConnectedCinemaSourcesForDailyRun,
  enqueueKino001BWorkerReadySources,
  runCinemaIngestionWorkerBatch,
} from "../api/_shared/cinema-ingestion-worker.js";

const boundedInteger = (name: string, fallback: number, minimum: number, maximum: number) => {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`invalid_environment:${name}`);
  }
  return value;
};

const errorCode = (error: unknown) => {
  if (!(error instanceof Error)) return "unknown_error";
  return error.message.replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 120) || error.name;
};

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const publishExactCatalogMovieId = () => {
  const args = process.argv.slice(2);
  if (!args.includes("--publish-exact")) return undefined;
  const catalogMovieArguments = args.filter((value) => value.startsWith("--catalog-movie-id="));
  if (args.length !== 2 || catalogMovieArguments.length !== 1) {
    throw new Error("cinema_publish_exact_arguments_invalid");
  }
  const catalogMovieId = catalogMovieArguments[0].slice("--catalog-movie-id=".length).trim();
  if (!uuid.test(catalogMovieId)) throw new Error("cinema_publish_exact_catalog_movie_id_invalid");
  return catalogMovieId;
};

const publishTelegramCinemaEvent = async (eventId: string, supabaseUrl: string, serviceRoleKey: string) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/telegramEventSupergroup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({
      action: "publish_city_poster_events",
      eventIds: [eventId],
      language: "ru",
    }),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || payload?.ok !== true) throw new Error("cinema_daily_publication_telegram_failed");
  return payload;
};

const exactTelegramMessageId = (payload: Record<string, unknown>, eventId: string) => {
  const rows = Array.isArray(payload.cityPosterPublications) ? payload.cityPosterPublications : [];
  if (rows.length !== 1) throw new Error("cinema_daily_publication_telegram_identity_invalid");
  const row = rows[0] as Record<string, unknown>;
  const result = row.result && typeof row.result === "object" ? row.result as Record<string, unknown> : null;
  const messageId = Number(result?.messageId);
  if (row.eventId !== eventId || result?.published !== true || result?.reused === true || !Number.isSafeInteger(messageId) || messageId <= 0) {
    throw new Error("cinema_daily_publication_telegram_identity_invalid");
  }
  return messageId;
};

const rollbackTelegramCinemaEvent = async (eventId: string, messageId: number, supabaseUrl: string, serviceRoleKey: string) => {
  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/telegramEventSupergroup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ action: "rollback_city_poster_event", eventId, messageId }),
  });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || payload?.ok !== true || payload?.rolledBack !== true) {
    throw new Error("cinema_daily_publication_telegram_rollback_failed");
  }
};

const candidateCityId = () => {
  const cityArgument = process.argv.find((value: string) => value.startsWith("--city="));
  const cityId = cityArgument?.slice("--city=".length).trim() || undefined;
  if (cityId && !/^[a-z0-9_-]{1,80}$/.test(cityId)) throw new Error("cinema_candidate_city_invalid");
  return cityId;
};

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const probeArgument = (name: string) => {
  const prefix = `--${name}=`;
  return process.argv.find((value: string) => value.startsWith(prefix))?.slice(prefix.length).trim() || undefined;
};

const runReadOnlySourceProbe = async () => {
  const adapterKey = probeArgument("adapter");
  const sourceUrl = probeArgument("url");
  const sourceId = probeArgument("source-id");
  const venueId = probeArgument("venue");
  const timezone = probeArgument("timezone") || "UTC";
  if (!adapterKey || !sourceUrl || !sourceId || !venueId) throw new Error("cinema_probe_arguments_required");
  const parsedUrl = new URL(sourceUrl);
  if (parsedUrl.protocol !== "https:") throw new Error("cinema_probe_https_required");
  const adapter = cinemaAdapters[adapterKey];
  if (!adapter) throw new Error("cinema_probe_adapter_unknown");
  const source: CinemaSourceConfig = {
    id: `probe:${sourceId}`,
    venue_id: venueId,
    source_id: sourceId,
    adapter_key: adapterKey,
    source_url: parsedUrl.toString(),
    fetch_method: "html",
    parser_version: "runtime-probe",
    timezone,
    enabled: false,
    fetch_interval_minutes: 1440,
    expected_horizon_days: 1,
    min_records: 1,
    config: { read_only_probe: true },
  };
  const payload = await adapter.fetchSnapshot(source);
  const result = adapter.parseSnapshot(source, payload);
  process.stdout.write(`${JSON.stringify({
    mode: "read_only_source_probe",
    source_id: source.source_id,
    venue_id: source.venue_id,
    adapter_key: adapter.key,
    fetched_at: payload.fetched_at,
    fetched_pages: payload.pages.length,
    fetch_failures: payload.failures,
    records_parsed: result.records_parsed,
    records_valid: result.records_valid,
    records_rejected: result.records_rejected,
    min_schedule_date: result.min_schedule_date,
    max_schedule_date: result.max_schedule_date,
    fetch_complete: result.fetch_complete,
    parser_complete: result.parser_complete,
    scope_complete: result.scope_complete,
    zero_result: result.zero_result,
    errors: result.errors,
    sample: result.rows.slice(0, 5).map((row) => ({
      external_movie_id: row.external_movie_id,
      title: row.title,
      original_title: row.original_title,
      release_year: row.release_year,
      duration_minutes: row.duration_minutes,
      starts_at_local: row.starts_at_local,
    })),
  })}\n`);
};

async function main() {
  if (process.argv.includes("--probe-source")) {
    await runReadOnlySourceProbe();
    return;
  }

  if (readEnv("GO_IRL_CINEMA_WORKER_ENABLED") !== "true") {
    throw new Error("cinema_worker_disabled");
  }
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const catalogMovieId = publishExactCatalogMovieId();
  if (catalogMovieId) {
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const result = await materializeApprovedDailyCinemaCandidate({
      db,
      input: { catalogMovieId },
      actorUserKey: "system:cinema-publish-exact",
    });
    const telegram = await publishTelegramCinemaEvent(result.event_id, supabaseUrl, serviceRoleKey).catch(async (error) => {
      await resetDailyCinemaCandidateAfterProviderFailure({ db, catalogMovieId, eventId: result.event_id });
      throw error;
    });
    const telegramMessageId = exactTelegramMessageId(telegram, result.event_id);
    try {
      await finalizeDailyCinemaCandidatePublication({
        db,
        catalogMovieId,
        eventId: result.event_id,
        actorUserKey: "owner:cinema-workerctl",
      });
    } catch (error) {
      try {
        await rollbackTelegramCinemaEvent(result.event_id, telegramMessageId, supabaseUrl, serviceRoleKey);
      } catch {
        throw new Error("cinema_daily_publication_finalize_failed_cleanup_required");
      }
      await resetDailyCinemaCandidateAfterProviderFailure({ db, catalogMovieId, eventId: result.event_id });
      throw error;
    }
    process.stdout.write(`${JSON.stringify({ ok: true, ...result, telegram })}\n`);
    return;
  }

  if (process.argv.includes("--list-daily-candidates")) {
    const cityId = candidateCityId();
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const summary = await loadDailyMovieCityCandidates({ db, cityId });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return;
  }

  if (process.argv.includes("--persist-daily-candidates")) {
    const cityId = candidateCityId();
    if (!cityId) throw new Error("cinema_candidate_persistence_city_required");
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const projection = await loadDailyMovieCityCandidates({ db, cityId });
    const summary = await persistDailyMovieCityCandidates({
      db,
      cityId,
      candidates: projection.candidates,
      observedAt: new Date(projection.as_of),
    });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    return;
  }

  if (process.argv.includes("--enqueue-connected-daily")) {
    const summary = await enqueueConnectedCinemaSourcesForDailyRun();
    process.stdout.write(`${JSON.stringify({
      ...summary,
      checkedAt: new Date().toISOString(),
    })}\n`);
    return;
  }

  if (process.argv.includes("--enqueue-kino001b-due")) {
    const summary = await enqueueKino001BWorkerReadySources();
    console.warn("kino001b_enqueue_due", {
      ok: true,
      considered: summary.considered,
      enqueued: summary.enqueued,
      duplicate: summary.duplicate,
      sourceIds: summary.sourceIds,
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  const enqueueSummary = await enqueueKino001BWorkerReadySources();
  console.warn("kino001b_startup_enqueue", {
    ok: true,
    considered: enqueueSummary.considered,
    enqueued: enqueueSummary.enqueued,
    duplicate: enqueueSummary.duplicate,
    sourceIds: enqueueSummary.sourceIds,
    checkedAt: new Date().toISOString(),
  });

  const once = process.argv.includes("--once");
  const batchLimit = boundedInteger("GO_IRL_CINEMA_WORKER_BATCH_LIMIT", 10, 1, 100);
  const pollMs = boundedInteger("GO_IRL_CINEMA_WORKER_POLL_MS", 5_000, 500, 60_000);
  const workerId = readEnv("GO_IRL_CINEMA_WORKER_ID") || `cinema-worker:${process.pid}`;
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  do {
    try {
      const summary = await runCinemaIngestionWorkerBatch({ workerId, limit: batchLimit });
      console.warn("cinema_worker_health", {
        ok: true,
        ...summary,
        checkedAt: new Date().toISOString(),
      });
      if (once) return;
      if (summary.claimed === 0) await sleep(pollMs);
    } catch (error) {
      console.error("cinema_worker_failed", { code: errorCode(error) });
      if (once) throw error;
      await sleep(Math.max(5_000, pollMs));
    }
  } while (!stopping);

  console.warn("cinema_worker_stopped", { graceful: true });
}

main().catch((error) => {
  console.error("cinema_worker_exit", { code: errorCode(error) });
  process.exitCode = 1;
});
