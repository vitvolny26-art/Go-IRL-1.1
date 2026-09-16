import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "../_shared/env.js";
import { isReminderWorkerAuthorized } from "../_shared/worker-authorization.js";
import { dispatchPendingCinemaPublicationApprovals } from "../_shared/cinema-publication-approval.js";

const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

const page = (status: number, title: string, message: string) => new Response(
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><main style="font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 20px"><h1>${title}</h1><p>${message}</p></main></body></html>`,
  {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  },
);

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const parseRequestUrl = (request: Request) => new URL(request.url, "https://goirl.invalid");
const validToken = (value: string) => /^[0-9a-f]{64}$/i.test(value);
const validPosterUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

const adminClient = () => createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const pragueClock = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  return {
    weekday: parts.find((part) => part.type === "weekday")?.value || "",
    hour: Number(parts.find((part) => part.type === "hour")?.value || "-1"),
  };
};

const isSundayEvening = (now = new Date()) => {
  const clock = pragueClock(now);
  return clock.weekday === "Sun" && clock.hour >= 17 && clock.hour <= 23;
};

type CandidateDecisionRow = {
  approval_id: string;
  movie_id: string;
  decision_state: string;
  claimed: boolean;
  sync_run_id: string | null;
};

type CandidateReviewRow = {
  approval_id: string;
  movie_id: string;
  movie_title: string;
  score: number;
  screening_count: number;
  day_count: number;
  reasons: Record<string, unknown>;
  week_start: string;
  week_end: string;
  candidate_status: string;
  expires_at: string | null;
};

type ParentApprovalRow = {
  id: string;
  parse_run_id: string;
  source_config_id: string;
  status: string;
};

type PosterStagingRow = { movie_id: string | null; normalized_payload: Record<string, unknown> | null };

const candidateFromReviewToken = async (db: SupabaseClient, token: string) => {
  const { data, error } = await db
    .from("cinema_publication_approval_movies")
    .select("approval_id,movie_id,movie_title,score,screening_count,day_count,reasons,week_start,week_end,candidate_status,expires_at")
    .eq("approve_token_hash", sha256(token.toLowerCase()))
    .maybeSingle();
  if (error) throw new Error(`cinema_approval_candidate_review_lookup_failed:${error.code}`);
  return (data || null) as CandidateReviewRow | null;
};

const loadParentApproval = async (db: SupabaseClient, approvalId: string) => {
  const { data, error } = await db
    .from("cinema_publication_approvals")
    .select("id,parse_run_id,source_config_id,status")
    .eq("id", approvalId)
    .single();
  if (error || !data) throw new Error(`cinema_approval_parent_load_failed:${error?.code || "not_found"}`);
  return data as ParentApprovalRow;
};

const persistMoviePostersFromStaging = async (db: SupabaseClient, parseRunId: string) => {
  const { data, error } = await db
    .from("cinema_screening_staging")
    .select("movie_id,normalized_payload")
    .eq("parse_run_id", parseRunId)
    .not("movie_id", "is", null);
  if (error) throw new Error(`cinema_approval_poster_staging_load_failed:${error.code}`);

  const posters = new Map<string, string>();
  for (const row of (data || []) as PosterStagingRow[]) {
    if (!row.movie_id || posters.has(row.movie_id)) continue;
    const posterUrl = row.normalized_payload?.poster_url;
    if (validPosterUrl(posterUrl)) posters.set(row.movie_id, posterUrl);
  }

  for (const [movieId, posterUrl] of posters) {
    const { error: updateError } = await db
      .from("cinema_movies")
      .update({ poster_url: posterUrl })
      .eq("id", movieId)
      .is("poster_url", null);
    if (updateError) throw new Error(`cinema_approval_poster_persist_failed:${updateError.code}`);
  }
};

async function handleRun(request: Request) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  if (!isReminderWorkerAuthorized(request)) return json(401, { error: "unauthorized" });
  if (readEnv("CINEMA_PUBLICATION_APPROVAL_ENABLED") !== "true") {
    return json(503, { error: "cinema_publication_approval_disabled" });
  }

  let body: { force?: boolean; limit?: number };
  try {
    body = await request.json() as { force?: boolean; limit?: number };
  } catch {
    body = {};
  }

  if (body.force !== true && !isSundayEvening()) {
    return json(200, { ok: true, skipped: "outside_sunday_evening_window" });
  }

  try {
    const result = await dispatchPendingCinemaPublicationApprovals(adminClient(), {
      limit: Number.isInteger(body.limit) ? body.limit : 1,
    });
    return json(200, { ok: true, ...result });
  } catch (error) {
    console.error("kino007a_approval_dispatch_failed", {
      code: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return json(500, { error: "cinema_publication_approval_dispatch_failed" });
  }
}

async function handlePreview(request: Request) {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { Allow: "GET" } });
  }

  const token = parseRequestUrl(request).searchParams.get("token") || "";
  if (!validToken(token)) return json(400, { error: "invalid_confirmation_token" });

  try {
    const db = adminClient();
    const candidate = await candidateFromReviewToken(db, token);
    if (!candidate) return json(404, { error: "candidate_not_found" });
    if (!["sending", "sent"].includes(candidate.candidate_status)) {
      return json(409, { error: "candidate_not_reviewable", status: candidate.candidate_status });
    }
    if (candidate.expires_at && new Date(candidate.expires_at).getTime() <= Date.now()) {
      return json(410, { error: "approval_expired" });
    }

    const approval = await loadParentApproval(db, candidate.approval_id);
    await persistMoviePostersFromStaging(db, approval.parse_run_id);

    const [{ data: source, error: sourceError }, { data: movie, error: movieError }] = await Promise.all([
      db.from("cinema_sources")
        .select("id,source_id,venue_id,cinema_venues(name,city_id)")
        .eq("id", approval.source_config_id)
        .single(),
      db.from("cinema_movies")
        .select("id,poster_url")
        .eq("id", candidate.movie_id)
        .single(),
    ]);

    if (sourceError || !source) throw new Error(`cinema_approval_source_load_failed:${sourceError?.code || "not_found"}`);
    if (movieError || !movie) throw new Error(`cinema_approval_movie_load_failed:${movieError?.code || "not_found"}`);
    if (!validPosterUrl(movie.poster_url)) return json(409, { error: "candidate_poster_missing" });

    const venueRelation = source.cinema_venues as unknown as { name?: string; city_id?: string } | Array<{ name?: string; city_id?: string }> | null;
    const venue = Array.isArray(venueRelation) ? venueRelation[0] : venueRelation;

    return json(200, {
      ok: true,
      approval: {
        id: approval.id,
        status: approval.status,
        expiresAt: candidate.expires_at,
        weekStart: candidate.week_start,
        weekEnd: candidate.week_end,
      },
      venue: {
        name: venue?.name || "Кинотеатр",
        cityId: venue?.city_id || "",
      },
      movie: {
        movie_id: candidate.movie_id,
        movie_title: candidate.movie_title,
        score: candidate.score,
        screening_count: candidate.screening_count,
        day_count: candidate.day_count,
        reasons: candidate.reasons,
        poster_url: movie.poster_url,
      },
    });
  } catch (error) {
    console.error("kino_single_candidate_preview_failed", {
      code: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    });
    return json(500, { error: "cinema_publication_candidate_preview_failed" });
  }
}

const claimDecision = async (db: SupabaseClient, token: string, decision: "approve" | "reject") => {
  const { data, error } = await db.rpc("cinema_claim_publication_movie_decision", {
    p_token_hash: sha256(token.toLowerCase()),
    p_decision: decision,
  });
  if (error) throw new Error(`cinema_approval_candidate_decision_claim_failed:${error.code}`);
  return (Array.isArray(data) ? data[0] : data) as CandidateDecisionRow | null;
};

const decisionMessage = (row: CandidateDecisionRow, asJson: boolean) => {
  const payload = row.decision_state === "approved"
    ? { status: 200, title: "Фильм подтверждён", message: "Этот фильм уже подтверждён." }
    : row.decision_state === "rejected"
      ? { status: 200, title: "Фильм пропущен", message: "Этот фильм уже был пропущен." }
      : row.decision_state === "expired" || row.decision_state === "superseded"
        ? { status: 410, title: "Подтверждение устарело", message: "Используйте последнее сообщение от GO IRL." }
        : { status: 409, title: "Решение уже обработано", message: `Текущее состояние: ${row.decision_state}.` };
  return asJson
    ? json(payload.status, { ok: payload.status === 200, state: row.decision_state, message: payload.message })
    : page(payload.status, payload.title, payload.message);
};

async function handleDecision(request: Request) {
  if (!["GET", "POST"].includes(request.method)) {
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  }

  const asJson = request.method === "POST";
  let token: string;
  let decision: string;

  if (asJson) {
    try {
      const body = await request.json() as { token?: unknown; decision?: unknown };
      token = typeof body.token === "string" ? body.token : "";
      decision = typeof body.decision === "string" ? body.decision : "";
    } catch {
      return json(400, { error: "invalid_request_body" });
    }
  } else {
    const url = parseRequestUrl(request);
    token = url.searchParams.get("token") || "";
    decision = url.searchParams.get("decision") || "";
  }

  if (!validToken(token) || !["approve", "reject"].includes(decision)) {
    return asJson
      ? json(400, { error: "invalid_confirmation" })
      : page(400, "Некорректная ссылка", "Эта ссылка подтверждения недействительна.");
  }

  const db = adminClient();
  try {
    const row = await claimDecision(db, token, decision as "approve" | "reject");
    if (!row) {
      return asJson
        ? json(404, { error: "candidate_not_found" })
        : page(400, "Ссылка недействительна", "Кандидат не был найден.");
    }
    if (!row.claimed) return decisionMessage(row, asJson);

    let nextDispatch: unknown = null;
    try {
      nextDispatch = await dispatchPendingCinemaPublicationApprovals(db, { limit: 1 });
    } catch (dispatchError) {
      console.error("kino_single_candidate_next_dispatch_failed", {
        code: dispatchError instanceof Error ? dispatchError.message.slice(0, 180) : "unknown",
      });
    }

    if (asJson) {
      return json(200, {
        ok: true,
        state: row.decision_state,
        movieId: row.movie_id,
        syncRunId: row.sync_run_id,
        nextDispatch,
      });
    }

    return decision === "approve"
      ? page(200, "Фильм подтверждён", "Решение сохранено. Следующий кандидат придёт отдельным сообщением в Telegram.")
      : page(200, "Фильм пропущен", "Решение сохранено. Следующий кандидат придёт отдельным сообщением в Telegram.");
  } catch (error) {
    console.error("kino_single_candidate_decision_failed", {
      code: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    });
    return asJson
      ? json(400, { error: "cinema_publication_candidate_decision_failed" })
      : page(400, "Подтверждение недействительно", "Решение не было применено.");
  }
}

export async function handleCinemaApproval(request: Request) {
  const url = parseRequestUrl(request);
  const mode = url.searchParams.get("mode");
  if (mode === "run") return handleRun(request);
  if (mode === "preview") return handlePreview(request);
  if (mode === "decision") return handleDecision(request);
  return json(404, { error: "cinema_publication_approval_route_not_found" });
}

export default {
  fetch(request: Request) {
    return handleCinemaApproval(request);
  },
};
