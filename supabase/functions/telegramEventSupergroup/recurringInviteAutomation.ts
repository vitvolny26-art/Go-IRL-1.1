import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

type TelegramApi = <T>(method: string, body?: Record<string, unknown>) => Promise<T>;

type RecurringInviteConfig = {
  enabled: true;
  cadence: "weekly";
  leadDays: 2;
  autoInvitePreviousJoined: boolean;
  seriesKey: string;
  occurrence: number;
  sourceActivityId?: string;
  invitedUserKeys?: string[];
};

type ActivityRow = {
  id: string;
  category_id: string;
  activity_ru: string;
  activity_cs: string;
  title_ru: string | null;
  title_cs: string | null;
  description_ru: string;
  description_cs: string;
  event_date: string;
  event_time: string | null;
  city_id: string | null;
  address: string;
  location_url: string | null;
  participant_note: string | null;
  activity_type: string | null;
  metadata: Record<string, unknown> | null;
  price: number;
  capacity: number;
  organizer: string;
  organizer_key: string;
  visibility: string;
};

const appOrigin = "https://go-irl.fun";

export const readRecurringInviteConfig = (metadata: Record<string, unknown> | null): RecurringInviteConfig | null => {
  const raw = metadata?.recurringInvite;
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (value.enabled !== true
    || value.cadence !== "weekly"
    || value.leadDays !== 2
    || typeof value.seriesKey !== "string"
    || !value.seriesKey
    || !Number.isInteger(value.occurrence)
    || Number(value.occurrence) < 1) return null;
  return {
    enabled: true,
    cadence: "weekly",
    leadDays: 2,
    autoInvitePreviousJoined: value.autoInvitePreviousJoined === true,
    seriesKey: value.seriesKey,
    occurrence: Number(value.occurrence),
    sourceActivityId: typeof value.sourceActivityId === "string" ? value.sourceActivityId : undefined,
    invitedUserKeys: Array.isArray(value.invitedUserKeys)
      ? value.invitedUserKeys.filter((item): item is string => typeof item === "string")
      : [],
  };
};

export const shiftIsoDate = (value: string, days: number) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error("invalid_activity_date");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
};

export const pragueDateKey = (now = new Date()) => new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Prague",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(now);

const deterministicOccurrenceId = async (seriesKey: string, occurrence: number) => {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`go-irl-recurring-invite:${seriesKey}:${occurrence}`),
  ));
  const bytes = digest.slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const telegramUserIdFor = async (supabase: SupabaseClient, userKey: string) => {
  const identity = await supabase.from("user_provider_identities")
    .select("provider_user_id")
    .eq("user_key", userKey)
    .eq("provider", "telegram")
    .eq("status", "active")
    .not("consented_at", "is", null)
    .maybeSingle();
  if (identity.error) throw identity.error;
  const id = Number(identity.data?.provider_user_id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const recurringMetadata = (
  metadata: Record<string, unknown> | null,
  config: RecurringInviteConfig,
  occurrence: number,
  sourceActivityId: string,
  invitedUserKeys: string[] = [],
) => ({
  ...(metadata || {}),
  recurringInvite: {
    enabled: true,
    cadence: "weekly",
    leadDays: 2,
    autoInvitePreviousJoined: config.autoInvitePreviousJoined,
    seriesKey: config.seriesKey,
    occurrence,
    sourceActivityId,
    invitedUserKeys,
  },
});

const createOrLoadNextActivity = async ({
  supabase,
  source,
  config,
  nextDate,
}: {
  supabase: SupabaseClient;
  source: ActivityRow;
  config: RecurringInviteConfig;
  nextDate: string;
}) => {
  const nextOccurrence = config.occurrence + 1;
  const nextId = await deterministicOccurrenceId(config.seriesKey, nextOccurrence);
  const existing = await supabase.from("activities")
    .select("id,metadata")
    .eq("id", nextId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    return { id: nextId, created: false, metadata: (existing.data.metadata || {}) as Record<string, unknown> };
  }

  const metadata = recurringMetadata(source.metadata, config, nextOccurrence, source.id);
  const inserted = await supabase.from("activities").insert({
    id: nextId,
    category_id: source.category_id,
    activity_ru: source.activity_ru,
    activity_cs: source.activity_cs,
    title_ru: source.title_ru,
    title_cs: source.title_cs,
    description_ru: source.description_ru,
    description_cs: source.description_cs,
    event_date: nextDate,
    event_time: source.event_time,
    city_id: source.city_id,
    address: source.address,
    location_url: source.location_url,
    participant_note: source.participant_note,
    activity_type: source.activity_type,
    metadata,
    price: source.price,
    capacity: source.capacity,
    organizer: source.organizer,
    organizer_key: source.organizer_key,
    visibility: "invite",
    urgent: false,
    popular: false,
  }).select("id").single();
  if (inserted.error) {
    const retry = await supabase.from("activities").select("id,metadata").eq("id", nextId).maybeSingle();
    if (retry.error || !retry.data) throw inserted.error;
    return { id: nextId, created: false, metadata: (retry.data.metadata || {}) as Record<string, unknown> };
  }

  const organizerMember = await supabase.from("activity_members").insert({
    activity_id: nextId,
    user_key: source.organizer_key,
    display_name: source.organizer,
    status: "joined",
  });
  if (organizerMember.error) throw organizerMember.error;
  return { id: nextId, created: true, metadata };
};

const invitePreviousJoinedMembers = async ({
  supabase,
  telegramApi,
  source,
  nextActivityId,
  nextDate,
  config,
  childMetadata,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  source: ActivityRow;
  nextActivityId: string;
  nextDate: string;
  config: RecurringInviteConfig;
  childMetadata: Record<string, unknown>;
}) => {
  if (!config.autoInvitePreviousJoined) return { eligible: 0, sent: 0, skipped: 0, failed: 0 };

  const members = await supabase.from("activity_members")
    .select("user_key,display_name")
    .eq("activity_id", source.id)
    .eq("status", "joined");
  if (members.error) throw members.error;

  const childConfig = readRecurringInviteConfig(childMetadata);
  const delivered = new Set(childConfig?.invitedUserKeys || []);
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  // Only reuse recipients explicitly recorded for the previous invitation.
  // Joined participants are not a substitute for the previous delivery list.
  const previousTargets = new Set(Array.isArray(source.metadata?.initialInviteUserKeys)
    ? source.metadata.initialInviteUserKeys.filter((value): value is string => typeof value === "string")
    : []);
  const eligible = (members.data || []).filter((member) =>
    String(member.user_key) !== source.organizer_key && previousTargets.has(String(member.user_key)));

  for (const member of eligible) {
    const userKey = String(member.user_key || "");
    if (!userKey || delivered.has(userKey)) {
      skipped += 1;
      continue;
    }
    try {
      const telegramUserId = await telegramUserIdFor(supabase, userKey);
      if (!telegramUserId) {
        skipped += 1;
        continue;
      }
      await telegramApi<{ message_id: number }>("sendMessage", {
        chat_id: telegramUserId,
        text: `Новое приглашение GO IRL: «${source.title_ru || source.activity_ru}» — ${nextDate}${source.event_time ? ` в ${source.event_time.slice(0, 5)}` : ""}.`,
        reply_markup: {
          inline_keyboard: [[{
            text: "Открыть событие",
            url: `${appOrigin}/join/${encodeURIComponent(nextActivityId)}`,
          }]],
        },
      });
      delivered.add(userKey);
      const updatedMetadata = recurringMetadata(
        childMetadata,
        { ...config, occurrence: config.occurrence + 1 },
        config.occurrence + 1,
        source.id,
        [...delivered],
      );
      const update = await supabase.from("activities").update({ metadata: updatedMetadata }).eq("id", nextActivityId);
      if (update.error) throw update.error;
      childMetadata = updatedMetadata;
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  return { eligible: eligible.length, sent, skipped, failed };
};

export const materializeDueRecurringInviteActivities = async ({
  supabase,
  telegramApi,
  now = new Date(),
  limit = 50,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  now?: Date;
  limit?: number;
}) => {
  const sources = await supabase.from("activities")
    .select("id,category_id,activity_ru,activity_cs,title_ru,title_cs,description_ru,description_cs,event_date,event_time,city_id,address,location_url,participant_note,activity_type,metadata,price,capacity,organizer,organizer_key,visibility")
    .eq("visibility", "invite")
    .contains("metadata", { recurringInvite: { enabled: true, cadence: "weekly", leadDays: 2 } })
    .order("event_date", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 200)));
  if (sources.error) throw sources.error;

  const today = pragueDateKey(now);
  let checked = 0;
  let created = 0;
  let reused = 0;
  let invited = 0;
  let failed = 0;
  let prompted = 0;
  let awaitingApproval = 0;

  for (const source of (sources.data || []) as ActivityRow[]) {
    const config = readRecurringInviteConfig(source.metadata);
    if (!config) continue;
    checked += 1;
    const nextDate = shiftIsoDate(source.event_date, 7);
    const dueDate = shiftIsoDate(nextDate, -config.leadDays);
    if (today < dueDate || nextDate < today) continue;

    try {
      const lookup = await supabase.from("activity_recurring_invite_approvals")
        .select("id,status,telegram_message_id")
        .eq("source_activity_id", source.id).eq("next_event_date", nextDate).maybeSingle();
      if (lookup.error) throw lookup.error;
      let approval = lookup.data;
      if (!approval) {
        const pending = await supabase.from("activity_recurring_invite_approvals").upsert({
          source_activity_id: source.id, next_event_date: nextDate,
          organizer_key: source.organizer_key, status: "pending",
        }, { onConflict: "source_activity_id,next_event_date", ignoreDuplicates: true })
          .select("id,status,telegram_message_id").maybeSingle();
        if (pending.error) throw pending.error;
        approval = pending.data;
        if (!approval) {
          const race = await supabase.from("activity_recurring_invite_approvals")
            .select("id,status,telegram_message_id")
            .eq("source_activity_id", source.id).eq("next_event_date", nextDate).maybeSingle();
          if (race.error) throw race.error;
          approval = race.data;
        }
      }
      if (!approval) throw new Error("recurring_approval_unavailable");
      if (approval.status === "pending") {
        const telegramId = await telegramUserIdFor(supabase, source.organizer_key);
        if (!telegramId) { awaitingApproval++; continue; }
        const confirmation = await telegramApi<{ message_id: number }>("sendMessage", {
          chat_id: telegramId,
          text: `GO IRL · Через 2 дня повторяется «${source.title_ru || source.activity_ru}» (${nextDate}). Опубликовать событие и пригласить тех же получателей?`,
          reply_markup: { inline_keyboard: [
            [{ text: "Да, тем же", callback_data: `activ020repeat:${approval.id}:same` }],
            [{ text: "Выбрать других", callback_data: `activ020repeat:${approval.id}:other` }],
            [{ text: "Без приглашений", callback_data: `activ020repeat:${approval.id}:none` }],
            [{ text: "Пропустить", callback_data: `activ020repeat:${approval.id}:skipped` }],
          ] },
        });
        const marked = await supabase.from("activity_recurring_invite_approvals")
          .update({ status: "prompted", telegram_message_id: confirmation.message_id,
            updated_at: new Date().toISOString() })
          .eq("id", approval.id).eq("status", "pending");
        if (marked.error) throw marked.error;
        prompted++;
        continue;
      }
      if (approval.status === "other" || approval.status === "prompted"
        || approval.status === "skipped" || approval.status === "pending") {
        awaitingApproval++;
        continue;
      }
      if (approval.status !== "same" && approval.status !== "none") continue;
      const next = await createOrLoadNextActivity({ supabase, source, config, nextDate });
      if (next.created) created++;
      else reused++;
      if (approval.status === "same") {
        const delivery = await invitePreviousJoinedMembers({
          supabase, telegramApi, source, nextActivityId: next.id, nextDate,
          config, childMetadata: next.metadata,
        });
        invited += delivery.sent;
      }
    } catch {
      failed++;
    }
  }
  return { checked, created, reused, invited, failed, prompted, awaitingApproval };
};

const recurringCallback = /^activ020repeat:([0-9a-f-]{36}):(same|other|none|skipped)$/i;
export const handleActiv020RecurringApprovalCallback = async ({
  supabase, telegramApi, callbackQuery,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  callbackQuery: { id?: string; data?: string; from?: { id?: number } };
}) => {
  const matched = callbackQuery.data?.match(recurringCallback);
  if (!matched) return { handled: false } as const;
  const actor = callbackQuery.from?.id;
  if (!callbackQuery.id || !Number.isSafeInteger(actor) || !actor || actor <= 0) {
    return { handled: true, rejected: "invalid_actor" } as const;
  }
  const identity = await supabase.from("user_provider_identities")
    .select("user_key").eq("provider", "telegram").eq("provider_user_id", String(actor))
    .eq("status", "active").not("consented_at", "is", null).maybeSingle();
  if (identity.error || !identity.data) return { handled: true, rejected: "unauthorized" } as const;
  const userKey = String(identity.data.user_key);
  const updated = await supabase.from("activity_recurring_invite_approvals")
    .update({ status: matched[2], updated_at: new Date().toISOString() })
    .eq("id", matched[1]).eq("organizer_key", userKey).eq("status", "prompted")
    .select("id").maybeSingle();
  if (updated.error) throw updated.error;
  await telegramApi<boolean>("answerCallbackQuery", {
    callback_query_id: callbackQuery.id,
    text: updated.data ? matched[2] === "other"
      ? "Откройте GO IRL и выберите новых получателей."
      : "Ваш выбор сохранён." : "Ответ уже обработан или недоступен.",
  });
  return { handled: true, approved: Boolean(updated.data), mode: matched[2] };
};
