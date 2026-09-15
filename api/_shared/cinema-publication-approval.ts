import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "./env.js";

type ApprovalRow = {
  id: string;
  parse_run_id: string;
  source_config_id: string;
  status: string;
};

type ParseRunRow = {
  records_valid: number;
  min_schedule_date: string | null;
  max_schedule_date: string | null;
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

const miniAppOrigin = () => {
  const host = readEnv("VERCEL_PROJECT_PRODUCTION_URL") || readEnv("VERCEL_URL");
  return host
    ? `https://${host.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
    : "https://go-irl-1-1.vercel.app";
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const compactError = (value: unknown) =>
  value instanceof Error
    ? value.message.replace(/[^A-Za-z0-9:_./ -]/g, "").slice(0, 300) || value.name
    : "unknown_error";

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

async function loadApprovalSummary(db: SupabaseClient, approval: ApprovalRow) {
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

  const { data: parseRun, error: parseError } = await db
    .from("cinema_parse_runs")
    .select("records_valid,min_schedule_date,max_schedule_date")
    .eq("id", approval.parse_run_id)
    .single();
  if (parseError || !parseRun) throw new Error(`cinema_approval_parse_load_failed:${parseError?.code || "not_found"}`);

  const { data: source, error: sourceError } = await db
    .from("cinema_sources")
    .select("id,source_id,venue_id")
    .eq("id", approval.source_config_id)
    .single();
  if (sourceError || !source) throw new Error(`cinema_approval_source_load_failed:${sourceError?.code || "not_found"}`);

  const sourceRow = source as SourceRow;
  const { data: venue, error: venueError } = await db
    .from("cinema_venues")
    .select("name,city_id")
    .eq("id", sourceRow.venue_id)
    .single();
  if (venueError || !venue) throw new Error(`cinema_approval_venue_load_failed:${venueError?.code || "not_found"}`);

  const [{ data: movies, error: movieError }, { data: promotions, error: promotionError }] = await Promise.all([
    db.from("cinema_publication_approval_movies")
      .select("selected,week_start,week_end")
      .eq("approval_id", approval.id),
    db.from("cinema_publication_approval_promotions")
      .select("selected")
      .eq("approval_id", approval.id),
  ]);
  if (movieError) throw new Error(`cinema_approval_movie_selection_load_failed:${movieError.code}`);
  if (promotionError) throw new Error(`cinema_approval_promotion_selection_load_failed:${promotionError.code}`);

  const selectedMovies = (movies || []).filter((row) => row.selected).length;
  const selectedPromotions = (promotions || []).filter((row) => row.selected).length;
  const firstMovie = movies?.[0] || null;

  return {
    parseRun: parseRun as ParseRunRow,
    source: sourceRow,
    venue: venue as VenueRow,
    movieCount: movies?.length || 0,
    selectedMovies,
    promotionCount: promotions?.length || 0,
    selectedPromotions,
    weekStart: firstMovie?.week_start || null,
    weekEnd: firstMovie?.week_end || null,
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
          { text: "Открыть подборку", web_app: { url: reviewUrl } },
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

export async function dispatchPendingCinemaPublicationApprovals(
  db: SupabaseClient,
  options: { limit?: number } = {},
) {
  if (!approvalEnabled()) return { disabled: true, claimed: 0, sent: 0, failed: 0 };

  const userKey = approvalUserKey();
  const chatId = await resolveTelegramDestination(db, userKey);
  const limit = Math.max(1, Math.min(options.limit ?? 5, 20));

  const { data, error } = await db
    .from("cinema_publication_approvals")
    .select("id,parse_run_id,source_config_id,status")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`cinema_approval_pending_load_failed:${error.code}`);

  let claimed = 0;
  let sent = 0;
  let failed = 0;

  for (const raw of (data || []) as ApprovalRow[]) {
    const claim = await db
      .from("cinema_publication_approvals")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", raw.id)
      .eq("status", "pending")
      .select("id,parse_run_id,source_config_id,status")
      .maybeSingle();
    if (claim.error) throw new Error(`cinema_approval_claim_failed:${claim.error.code}`);
    if (!claim.data) continue;
    claimed += 1;

    const approval = claim.data as ApprovalRow;
    try {
      const summary = await loadApprovalSummary(db, approval);
      const approveToken = randomBytes(32).toString("hex");
      const rejectToken = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 48 * 60 * 60_000).toISOString();

      const tokenUpdate = await db
        .from("cinema_publication_approvals")
        .update({
          requested_user_key: userKey,
          approve_token_hash: sha256(approveToken),
          reject_token_hash: sha256(rejectToken),
          expires_at: expiresAt,
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", approval.id)
        .eq("status", "sending");
      if (tokenUpdate.error) throw new Error(`cinema_approval_token_store_failed:${tokenUpdate.error.code}`);

      const weekRange = summary.weekStart && summary.weekEnd
        ? `${summary.weekStart} — ${summary.weekEnd}`
        : "следующая календарная неделя";
      const text = [
        "Подборка кино готова к проверке.",
        "",
        "🎬 Сити Афиша → Кино",
        `📍 ${summary.venue.name}`,
        `Неделя: ${weekRange}`,
        `Фильмы: выбрано ${summary.selectedMovies} из ${summary.movieCount}`,
        summary.promotionCount
          ? `Акции со скидкой → Activity Кино: выбрано ${summary.selectedPromotions} из ${summary.promotionCount}`
          : "Акции со скидкой → Activity Кино: нет новых",
        "",
        "Все сеансы сохраняются в расписании. Публично появятся только выбранные фильмы и подтверждённые скидочные акции.",
      ].join("\n");

      const origin = miniAppOrigin();
      const reviewUrl = `${origin}/cinema/approval?token=${encodeURIComponent(approveToken)}&rejectToken=${encodeURIComponent(rejectToken)}`;
      const messageId = await sendTelegramPrompt(chatId, text, reviewUrl);

      const finish = await db
        .from("cinema_publication_approvals")
        .update({
          status: "sent",
          telegram_message_id: messageId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", approval.id)
        .eq("status", "sending");
      if (finish.error) throw new Error(`cinema_approval_prompt_finish_failed:${finish.error.code}`);
      sent += 1;
    } catch (error) {
      failed += 1;
      const message = compactError(error);
      await db
        .from("cinema_publication_approvals")
        .update({
          status: "failed",
          approve_token_hash: null,
          reject_token_hash: null,
          error_message: message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", approval.id)
        .eq("status", "sending");
    }
  }

  return { disabled: false, claimed, sent, failed };
}
