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
const validUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

type ClaimRow = {
  approval_id: string;
  parse_run_id: string;
  decision_state: string;
  claimed: boolean;
};

type ReviewApproval = {
  id: string;
  parse_run_id: string;
  source_config_id: string;
  status: string;
  expires_at: string | null;
  selection_week_start: string | null;
  selection_week_end: string | null;
};

type PromotionActivityRow = { activity_id: string };
type PromotionPostSummary = { attempted: number; published: number; failed: number };
type PosterStagingRow = { movie_id: string | null; normalized_payload: Record<string, unknown> | null };
type PosterMovieRow = { id: string; poster_url: string | null };

const approvalFromReviewToken = async (db: SupabaseClient, token: string) => {
  const { data, error } = await db
    .from("cinema_publication_approvals")
    .select("id,parse_run_id,source_config_id,status,expires_at,selection_week_start,selection_week_end")
    .eq("approve_token_hash", sha256(token.toLowerCase()))
    .maybeSingle();
  if (error) throw new Error(`cinema_approval_review_lookup_failed:${error.code}`);
  return (data || null) as ReviewApproval | null;
};

const persistMoviePostersFromStaging = async (
  db: SupabaseClient,
  parseRunId: string,
) => {
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
      limit: Number.isInteger(body.limit) ? body.limit : 5,
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
    let approval = await approvalFromReviewToken(db, token);
    if (!approval) return json(404, { error: "approval_not_found" });
    if (!["sending", "sent"].includes(approval.status)) {
      return json(409, { error: "approval_not_reviewable", status: approval.status });
    }
    if (approval.expires_at && new Date(approval.expires_at).getTime() <= Date.now()) {
      return json(410, { error: "approval_expired" });
    }

    const seeded = await db.rpc("cinema_seed_publication_selection", { p_approval_id: approval.id });
    if (seeded.error) throw new Error(`cinema_approval_selection_seed_failed:${seeded.error.code}`);
    await persistMoviePostersFromStaging(db, approval.parse_run_id);

    approval = await approvalFromReviewToken(db, token);
    if (!approval) return json(404, { error: "approval_not_found" });

    const [{ data: source, error: sourceError }, { data: movies, error: moviesError }, { data: promotions, error: promotionsError }] = await Promise.all([
      db.from("cinema_sources")
        .select("id,source_id,venue_id,cinema_venues(name,city_id)")
        .eq("id", approval.source_config_id)
        .single(),
      db.from("cinema_publication_approval_movies")
        .select("movie_id,movie_title,score,screening_count,day_count,reasons,selected,week_start,week_end")
        .eq("approval_id", approval.id)
        .order("score", { ascending: false })
        .order("screening_count", { ascending: false })
        .order("movie_title", { ascending: true }),
      db.from("cinema_publication_approval_promotions")
        .select("promotion_key,title,description,start_date,end_date,promo_price,currency,discount_text,terms,source_url,selected")
        .eq("approval_id", approval.id)
        .order("start_date", { ascending: true })
        .order("title", { ascending: true }),
    ]);

    if (sourceError || !source) throw new Error(`cinema_approval_source_load_failed:${sourceError?.code || "not_found"}`);
    if (moviesError) throw new Error(`cinema_approval_movies_load_failed:${moviesError.code}`);
    if (promotionsError) throw new Error(`cinema_approval_promotions_load_failed:${promotionsError.code}`);

    const movieIds = (movies || []).map((movie) => movie.movie_id).filter(Boolean);
    let moviePosters: PosterMovieRow[] = [];
    if (movieIds.length) {
      const { data: posterRows, error: posterError } = await db
        .from("cinema_movies")
        .select("id,poster_url")
        .in("id", movieIds);
      if (posterError) throw new Error(`cinema_approval_movie_posters_load_failed:${posterError.code}`);
      moviePosters = (posterRows || []) as PosterMovieRow[];
    }
    const posterByMovie = new Map(moviePosters.map((movie) => [movie.id, movie.poster_url]));
    const reviewMovies = (movies || []).map((movie) => ({
      ...movie,
      poster_url: posterByMovie.get(movie.movie_id) || null,
    }));

    const venueRelation = source.cinema_venues as unknown as { name?: string; city_id?: string } | Array<{ name?: string; city_id?: string }> | null;
    const venue = Array.isArray(venueRelation) ? venueRelation[0] : venueRelation;

    return json(200, {
      ok: true,
      approval: {
        id: approval.id,
        status: approval.status,
        expiresAt: approval.expires_at,
        weekStart: approval.selection_week_start || reviewMovies[0]?.week_start || null,
        weekEnd: approval.selection_week_end || reviewMovies[0]?.week_end || null,
      },
      venue: {
        name: venue?.name || "Кинотеатр",
        cityId: venue?.city_id || "",
      },
      movies: reviewMovies,
      promotions: promotions || [],
    });
  } catch (error) {
    console.error("kino_weekly_approval_preview_failed", {
      code: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    });
    return json(500, { error: "cinema_publication_approval_preview_failed" });
  }
}

const claimDecision = async (db: SupabaseClient, token: string, decision: "approve" | "reject") => {
  const { data, error } = await db.rpc("cinema_claim_publication_decision", {
    p_token_hash: sha256(token.toLowerCase()),
    p_decision: decision,
  });
  if (error) throw new Error(`cinema_approval_decision_claim_failed:${error.code}`);
  return (Array.isArray(data) ? data[0] : data) as ClaimRow | null;
};

const decisionMessage = (row: ClaimRow, asJson: boolean) => {
  const payload = row.decision_state === "applied"
    ? { status: 200, title: "Уже опубликовано", message: "Эта подборка уже опубликована." }
    : row.decision_state === "applying"
      ? { status: 200, title: "Публикация уже запущена", message: "Повторное нажатие не создаст вторую публикацию." }
      : row.decision_state === "rejected"
        ? { status: 200, title: "Не публикуем", message: "Эта подборка уже была отклонена." }
        : row.decision_state === "expired" || row.decision_state === "superseded"
          ? { status: 410, title: "Подтверждение устарело", message: "Используйте последнее сообщение от GO IRL." }
          : { status: 409, title: "Решение уже обработано", message: `Текущее состояние: ${row.decision_state}.` };
  return asJson
    ? json(payload.status, { ok: payload.status === 200, state: row.decision_state, message: payload.message })
    : page(payload.status, payload.title, payload.message);
};

const publishPromotionActivities = async (
  db: SupabaseClient,
  approvalId: string,
): Promise<PromotionPostSummary> => {
  const { data, error } = await db
    .from("cinema_promotion_publications")
    .select("activity_id")
    .eq("approval_id", approvalId);
  if (error) {
    console.error("kino_weekly_promotion_activity_lookup_failed", { code: error.code || "unknown" });
    return { attempted: 0, published: 0, failed: 1 };
  }

  const rows = (data || []) as PromotionActivityRow[];
  if (!rows.length) return { attempted: 0, published: 0, failed: 0 };

  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  let published = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/telegramEventSupergroup`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "publish_city_activity",
          activityId: row.activity_id,
          language: "cs",
        }),
      });
      if (!response.ok) {
        failed += 1;
        console.error("kino_weekly_promotion_activity_publish_failed", { status: response.status });
        continue;
      }
      published += 1;
    } catch (error) {
      failed += 1;
      console.error("kino_weekly_promotion_activity_publish_failed", {
        code: error instanceof Error ? error.message.slice(0, 120) : "network_error",
      });
    }
  }

  return { attempted: rows.length, published, failed };
};

const applyApproval = async (db: SupabaseClient, row: ClaimRow, asJson: boolean) => {
  const { data: syncRunId, error: applyError } = await db.rpc("cinema_apply_publication_approval", {
    p_approval_id: row.approval_id,
  });

  if (applyError || !syncRunId) {
    const message = applyError?.message || "cinema_apply_publication_approval_failed";
    await db.rpc("cinema_finish_publication_approval", {
      p_approval_id: row.approval_id,
      p_success: false,
      p_sync_run_id: null,
      p_error_message: message.slice(0, 500),
    });
    console.error("kino_weekly_apply_failed", { code: applyError?.code || "no_sync_run_id" });
    return asJson
      ? json(409, { error: "cinema_publication_apply_failed" })
      : page(409, "Публикация не выполнена", "Подборка не применена. Повторная публикация не создавалась.");
  }

  const promotionActivityPosts = await publishPromotionActivities(db, row.approval_id);
  const message = promotionActivityPosts.failed > 0
    ? "Выбранные фильмы опубликованы в Сити Афиша → Кино. Activity Кино созданы, но часть Telegram-публикаций требует повторной проверки."
    : "Выбранные фильмы опубликованы в Сити Афиша → Кино, выбранные скидочные акции опубликованы как Activity Кино.";

  return asJson
    ? json(200, { ok: true, state: "applied", syncRunId, promotionActivityPosts })
    : page(200, promotionActivityPosts.failed > 0 ? "Подборка применена" : "Опубликовано", message);
};

async function handleDecision(request: Request) {
  if (!["GET", "POST"].includes(request.method)) {
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  }

  const asJson = request.method === "POST";
  let token: string;
  let decision: string;
  let movieIds: string[] = [];
  let promotionKeys: string[] = [];

  if (asJson) {
    try {
      const body = await request.json() as {
        token?: unknown;
        decision?: unknown;
        movieIds?: unknown;
        promotionKeys?: unknown;
      };
      token = typeof body.token === "string" ? body.token : "";
      decision = typeof body.decision === "string" ? body.decision : "";
      movieIds = Array.isArray(body.movieIds)
        ? body.movieIds.filter((value): value is string => typeof value === "string" && validUuid(value)).slice(0, 100)
        : [];
      promotionKeys = Array.isArray(body.promotionKeys)
        ? body.promotionKeys
          .filter((value): value is string => typeof value === "string" && value.length > 0 && value.length <= 200)
          .slice(0, 100)
        : [];
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
    if (decision === "approve") {
      const approval = await approvalFromReviewToken(db, token);
      if (!approval) {
        return asJson
          ? json(404, { error: "approval_not_found" })
          : page(400, "Ссылка недействительна", "Решение не было найдено.");
      }

      const seeded = await db.rpc("cinema_seed_publication_selection", { p_approval_id: approval.id });
      if (seeded.error) throw new Error(`cinema_approval_selection_seed_failed:${seeded.error.code}`);

      if (asJson) {
        const update = await db.rpc("cinema_update_publication_selection", {
          p_approval_id: approval.id,
          p_token_hash: sha256(token.toLowerCase()),
          p_movie_ids: movieIds,
          p_promotion_keys: promotionKeys,
        });
        if (update.error) throw new Error(`cinema_approval_selection_update_failed:${update.error.code}`);
      }
    }

    const row = await claimDecision(db, token, decision as "approve" | "reject");
    if (!row) {
      return asJson
        ? json(404, { error: "approval_not_found" })
        : page(400, "Ссылка недействительна", "Решение не было найдено.");
    }
    if (!row.claimed) return decisionMessage(row, asJson);

    if (decision === "reject") {
      return asJson
        ? json(200, { ok: true, state: "rejected" })
        : page(200, "Не публикуем", "Кино-подборка оставлена вне публикации.");
    }

    return applyApproval(db, row, asJson);
  } catch (error) {
    console.error("kino_weekly_decision_failed", {
      code: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    });
    return asJson
      ? json(400, { error: "cinema_publication_decision_failed" })
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
