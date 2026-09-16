import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "./env.js";

type ApprovalRow = {
  id: string;
  parse_run_id: string;
  source_config_id: string;
  status: string;
};

type CandidateRow = {
  approval_id: string;
  movie_id: string;
  movie_title: string;
  score: number;
  screening_count: number;
  day_count: number;
  reasons: Record<string, unknown>;
  selected: boolean;
  week_start: string;
  week_end: string;
  candidate_status: string;
};

type SourceRow = {
  id: string;
  source_id: string;
  venue_id: string;
};

type VenueRow = {
  name: string;
  city_id: string;
};

type RouteRow = {
  provider_identity_id: string | null;
};

type IdentityRow = {
  provider_user_id: string;
  status: string;
  consented_at: string | null;
};

const approvalEnabled = () => readEnv("CINEMA_PUBLICATION_APPROVAL_ENABLED") === "true";
const approvalUserKey = () => requireEnv("CINEMA_PUBLICATION_APPROVAL_USER_KEY");

const miniAppOrigin = () => "https://go-irl-1-1.vercel.app";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const compactError = (value: unknown) =>
  value instanceof Error
    ? value.message.replace(/[^A-Za-z0-9:_./ -]/g, "").slice(0, 300) || value.name
    : "unknown_error";

const validPosterUrl = (value: unknown): value is string => {
  if (typeof value !== "string" || value.length > 2000) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
};

async function resolveTelegramDestination(db: SupabaseClient, userKey: string) {
  const { data: routes, error: routeError } = await db
    .from("communication_routes")
    .select("provider_identity_id")
    .eq("user_key", userKey)
    .eq("channel", "telegram")
    .eq("readiness", "ready")
    .eq("consent_state", "granted")
    .contains("capabilities", ["outbound", "notification"])
    .limit(1);
  if (routeError) throw new Error(`cinema_approval_route_lookup_failed:${routeError.code}`);
  const route = (routes?.[0] || null) as RouteRow | null;
  if (!route?.provider_identity_id) throw new Error("cinema_approval_telegram_route_not_ready");

  const { data: identity, error: identityError } = await db
    .from("user_provider_identities")
    .select("provider_user_id,status,consented_at")
    .eq("id", route.provider_identity_id)
    .eq("provider", "telegram")
    .maybeSingle();
  if (identityError || !identity) {
    throw new Error(`cinema_approval_telegram_identity_missing:${identityError?.code || "not_found"}`);
  }
  const row = identity as IdentityRow;
  if (row.status !== "active" || !row.consented_at || !/^[1-9][0-9]*$/.test(row.provider_user_id)) {
    throw new Error("cinema_approval_telegram_identity_not_executable");
  }
  return row.provider_user_id;
}

async function loadCandidateContext(db: SupabaseClient, approval: ApprovalRow) {
  const { data: gate, error: gateError } = await db
    .from("cinema_publication_approval_sources")
    .select("source_config_id")
    .eq("source_config_id", approval.source_config_id)
    .eq("active", true)
    .maybeSingle();
  if (gateError || !gate) {
    throw new Error(`cinema_approval_source_gate_inactive:${gateError?.code || "not_active"}`);
  }

  const seed = await db.rpc("cinema_seed_publication_selection", { p_approval_id: approval.id });
  if (seed.error) throw new Error(`cinema_approval_selection_seed_failed:${seed.error.code}`);

  const clearLegacySelection = await db
    .from("cinema_publication_approval_movies")
    .update({ selected: false, updated_at: new Date().toISOString() })
    .eq("approval_id", approval.id)
    .eq("candidate_status", "pending");
  if (clearLegacySelection.error) {
    throw new Error(`cinema_approval_candidate_selection_reset_failed:${clearLegacySelection.error.code}`);
  }

  const { data: source, error: sourceError } = await db
    .from("cinema_sources")
    .select("id,source_id,venue_id")
    .eq("id", approval.source_config_id)
    .single();
  if (sourceError || !source) {
    throw new Error(`cinema_approval_source_load_failed:${sourceError?.code || "not_found"}`);
  }

  const sourceRow = source as SourceRow;
  const { data: venue, error: venueError } = await db
    .from("cinema_venues")
    .select("name,city_id")
    .eq("id", sourceRow.venue_id)
    .single();
  if (venueError || !venue) {
    throw new Error(`cinema_approval_venue_load_failed:${venueError?.code || "not_found"}`);
  }

  const { data: candidate, error: candidateError } = await db
    .from("cinema_publication_approval_movies")
    .select("approval_id,movie_id,movie_title,score,screening_count,day_count,reasons,selected,week_start,week_end,candidate_status")
    .eq("approval_id", approval.id)
    .eq("candidate_status", "pending")
    .order("score", { ascending: false })
    .order("screening_count", { ascending: false })
    .order("movie_title", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (candidateError) throw new Error(`cinema_approval_candidate_load_failed:${candidateError.code}`);

  const candidateRow = (candidate || null) as CandidateRow | null;
  if (!candidateRow) {
    return { source: sourceRow, venue: venue as VenueRow, candidate: null, posterUrl: null };
  }

  const { data: movie, error: movieError } = await db
    .from("cinema_movies")
    .select("poster_url")
    .eq("id", candidateRow.movie_id)
    .single();
  if (movieError || !movie) {
    throw new Error(`cinema_approval_candidate_movie_load_failed:${movieError?.code || "not_found"}`);
  }
  if (!validPosterUrl(movie.poster_url)) throw new Error("cinema_approval_candidate_poster_missing");

  return {
    source: sourceRow,
    venue: venue as VenueRow,
    candidate: candidateRow,
    posterUrl: movie.poster_url as string,
  };
}

async function sendTelegramPrompt(chatId: string, text: string, reviewUrl: string) {
  const response = await fetch(`https://api.telegram.org/bot${requireEnv("TELEGRAM_BOT_TOKEN")}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: Number(chatId),
      text,
      reply_markup: {
        inline_keyboard: [[
          { text: "Открыть кандидата", web_app: { url: reviewUrl } },
        ]],
      },
    }),
  });
  const payload = await response.json() as {
    ok?: boolean;
    result?: { message_id?: number };
    description?: string;
  };
  if (!response.ok || !payload.ok || !payload.result?.message_id) {
    throw new Error(`cinema_approval_telegram_send_failed:${payload.description || response.status}`);
  }
  return String(payload.result.message_id);
}

const movieTags = (reasons: Record<string, unknown>) => {
  const tags: string[] = [];
  if (reasons.has4k === true) tags.push("4K");
  if (reasons.hasDolby === true) tags.push("Dolby Atmos");
  if (reasons.has3d === true) tags.push("3D");
  if (reasons.hasDbox === true) tags.push("D-BOX");
  if (reasons.hasOriginal === true) tags.push("Original");
  if (typeof reasons.imdbRating === "number") tags.push(`IMDb ${reasons.imdbRating}`);
  return tags;
};

export async function dispatchPendingCinemaPublicationApprovals(
  db: SupabaseClient,
  options: { limit?: number } = {},
) {
  if (!approvalEnabled()) return { disabled: true, claimed: 0, sent: 0, failed: 0 };

  const userKey = approvalUserKey();
  const chatId = await resolveTelegramDestination(db, userKey);
  const now = new Date().toISOString();

  const expire = await db
    .from("cinema_publication_approval_movies")
    .update({
      candidate_status: "expired",
      approve_token_hash: null,
      reject_token_hash: null,
      updated_at: now,
    })
    .in("candidate_status", ["sending", "sent"])
    .lte("expires_at", now);
  if (expire.error) throw new Error(`cinema_approval_candidate_expire_failed:${expire.error.code}`);

  const { data: openCandidate, error: openError } = await db
    .from("cinema_publication_approval_movies")
    .select("approval_id,movie_id")
    .in("candidate_status", ["sending", "sent"])
    .limit(1)
    .maybeSingle();
  if (openError) throw new Error(`cinema_approval_open_candidate_load_failed:${openError.code}`);
  if (openCandidate) {
    return {
      disabled: false,
      claimed: 0,
      sent: 0,
      failed: 0,
      blocked: "candidate_waiting_for_decision",
    };
  }

  const limit = Math.max(1, Math.min(options.limit ?? 1, 20));
  const { data, error } = await db
    .from("cinema_publication_approvals")
    .select("id,parse_run_id,source_config_id,status")
    .in("status", ["pending", "sent", "applied"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`cinema_approval_pending_load_failed:${error.code}`);

  let claimed = 0;
  let failed = 0;

  for (const approval of (data || []) as ApprovalRow[]) {
    const context = await loadCandidateContext(db, approval);
    if (!context.candidate) continue;

    const candidate = context.candidate;
    const claim = await db
      .from("cinema_publication_approval_movies")
      .update({ candidate_status: "sending", error_message: null, updated_at: new Date().toISOString() })
      .eq("approval_id", candidate.approval_id)
      .eq("movie_id", candidate.movie_id)
      .eq("candidate_status", "pending")
      .select("approval_id,movie_id,movie_title,score,screening_count,day_count,reasons,selected,week_start,week_end,candidate_status")
      .maybeSingle();
    if (claim.error) throw new Error(`cinema_approval_candidate_claim_failed:${claim.error.code}`);
    if (!claim.data) continue;
    claimed += 1;

    const claimedCandidate = claim.data as CandidateRow;
    try {
      const approveToken = randomBytes(32).toString("hex");
      const rejectToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60_000).toISOString();

      const tokenUpdate = await db
        .from("cinema_publication_approval_movies")
        .update({
          approve_token_hash: sha256(approveToken),
          reject_token_hash: sha256(rejectToken),
          expires_at: expiresAt,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("approval_id", claimedCandidate.approval_id)
        .eq("movie_id", claimedCandidate.movie_id)
        .eq("candidate_status", "sending");
      if (tokenUpdate.error) {
        throw new Error(`cinema_approval_candidate_token_store_failed:${tokenUpdate.error.code}`);
      }

      const parentUpdate = await db
        .from("cinema_publication_approvals")
        .update({ requested_user_key: userKey, updated_at: new Date().toISOString() })
        .eq("id", claimedCandidate.approval_id)
        .in("status", ["pending", "sent", "applied"]);
      if (parentUpdate.error) throw new Error(`cinema_approval_parent_touch_failed:${parentUpdate.error.code}`);

      const tags = movieTags(claimedCandidate.reasons);
      const text = [
        "Кандидат кино готов к проверке.",
        "",
        `🎬 ${claimedCandidate.movie_title}`,
        `📍 ${context.venue.name}`,
        `Неделя: ${claimedCandidate.week_start} — ${claimedCandidate.week_end}`,
        `Score: ${claimedCandidate.score} · ${claimedCandidate.day_count} дн. · ${claimedCandidate.screening_count} сеанс.`,
        tags.length ? `Метки: ${tags.join(" · ")}` : null,
        "Постер: готов",
        "",
        "Подтвердите только этот фильм. Следующий кандидат придёт отдельным сообщением после решения.",
      ].filter((line): line is string => line !== null).join("\n");

      const origin = miniAppOrigin();
      const reviewUrl = `${origin}/cinema/approval?token=${encodeURIComponent(approveToken)}&rejectToken=${encodeURIComponent(rejectToken)}`;
      const messageId = await sendTelegramPrompt(chatId, text, reviewUrl);

      const finish = await db
        .from("cinema_publication_approval_movies")
        .update({
          candidate_status: "sent",
          telegram_message_id: messageId,
          updated_at: new Date().toISOString(),
        })
        .eq("approval_id", claimedCandidate.approval_id)
        .eq("movie_id", claimedCandidate.movie_id)
        .eq("candidate_status", "sending");
      if (finish.error) throw new Error(`cinema_approval_candidate_prompt_finish_failed:${finish.error.code}`);

      if (approval.status === "pending") {
        const markParentSent = await db
          .from("cinema_publication_approvals")
          .update({ status: "sent", updated_at: new Date().toISOString() })
          .eq("id", approval.id)
          .eq("status", "pending");
        if (markParentSent.error) throw new Error(`cinema_approval_parent_sent_failed:${markParentSent.error.code}`);
      }

      return { disabled: false, claimed, sent: 1, failed };
    } catch (error) {
      failed += 1;
      const message = compactError(error);
      await db
        .from("cinema_publication_approval_movies")
        .update({
          candidate_status: "pending",
          approve_token_hash: null,
          reject_token_hash: null,
          expires_at: null,
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("approval_id", claimedCandidate.approval_id)
        .eq("movie_id", claimedCandidate.movie_id)
        .eq("candidate_status", "sending");
      return { disabled: false, claimed, sent: 0, failed };
    }
  }

  return { disabled: false, claimed, sent: 0, failed };
}
