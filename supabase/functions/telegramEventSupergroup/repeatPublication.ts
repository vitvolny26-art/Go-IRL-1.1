import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  organizerSurveyCopy,
  resolveOrganizerSurveyLanguage,
  type OrganizerSurveyLanguage,
} from "../../../api/_shared/post-event-organizer-survey.ts";

type TelegramApi = <T>(method: string, body?: Record<string, unknown>) => Promise<T>;

type RepeatPromptRow = {
  prompt_id: string;
  source_activity_id: string;
  organizer_key: string;
  telegram_user_id: string;
  city_id: string | null;
  title: string;
  event_date: string;
  event_time: string | null;
};

type RepeatDecisionRow = {
  created_activity_id: string | null;
  duplicate: boolean;
  published: boolean;
  visibility: string | null;
};

type ActivityRow = {
  id: string;
  title_ru: string | null;
  title_cs: string | null;
  event_date: string;
  event_time: string | null;
  city_id: string | null;
  address: string;
  visibility: string;
};

type RepeatCallbackQuery = {
  id?: string;
  data?: string;
  from?: { id?: number };
  message?: { chat?: { id?: number }; message_id?: number };
};

type RepeatPromptContext = {
  source_activity_id: string;
  organizer_key: string;
  status: string;
  expires_at: string;
  telegram_message_id: number | null;
  next_activity_id: string | null;
};

type RepeatSourceActivity = {
  category_id: string;
  activity_ru: string;
  activity_cs: string;
  title_ru: string;
  title_cs: string;
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
};

const callbackPattern = /^repeat:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):(yes|no)$/i;
const publicAppOrigin = "https://go-irl.fun";

const editableDraftCopy: Record<OrganizerSurveyLanguage, { ready: string; duplicate: string; button: string }> = {
  ru: { ready: "Копия события сохранена как черновик. Отредактируйте её перед публикацией.", duplicate: "Черновик события уже создан.", button: "Редактировать событие" },
  uk: { ready: "Копію події збережено як чернетку. Відредагуйте її перед публікацією.", duplicate: "Чернетку події вже створено.", button: "Редагувати подію" },
  cs: { ready: "Kopie události byla uložena jako koncept. Před zveřejněním ji upravte.", duplicate: "Koncept události už byl vytvořen.", button: "Upravit událost" },
  en: { ready: "The event copy was saved as a draft. Edit it before publishing.", duplicate: "The event draft already exists.", button: "Edit event" },
  pl: { ready: "Kopia wydarzenia została zapisana jako wersja robocza. Edytuj ją przed publikacją.", duplicate: "Wersja robocza wydarzenia już istnieje.", button: "Edytuj wydarzenie" },
  sk: { ready: "Kópia udalosti bola uložená ako koncept. Pred zverejnením ju upravte.", duplicate: "Koncept udalosti už existuje.", button: "Upraviť udalosť" },
};

export const parseRepeatPublicationCallback = (value: string | undefined) => {
  const match = value?.match(callbackPattern);
  if (!match) return null;
  return { promptId: match[1].toLowerCase(), decision: match[2] as "yes" | "no" };
};

const dateLabel = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : value;
};

const timeLabel = (value: string | null) => value ? value.slice(0, 5) : "";

const retryDelaySeconds = (attemptCount: number) => Math.min(3600, Math.max(60, 60 * 2 ** Math.max(0, attemptCount - 1)));

const cityLabel = (cityId: string | null) => {
  if (cityId === "praha") return "Praha";
  if (cityId === "olomouc") return "Olomouc";
  return cityId || "GO IRL";
};

const shiftIsoDate = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error("repeat_source_date_invalid");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const draftEditUrl = (activityId: string) => `${publicAppOrigin}/e/${encodeURIComponent(activityId)}`;

const resolvePostEventLanguage = async (
  supabase: SupabaseClient,
  telegramUserId: number,
): Promise<OrganizerSurveyLanguage> => {
  const identity = await supabase.from("user_provider_identities").select("user_key")
    .eq("provider", "telegram").eq("provider_user_id", String(telegramUserId))
    .eq("status", "active").not("consented_at", "is", null).maybeSingle();
  if (identity.error || !identity.data) return "en";
  const user = await supabase.from("app_users").select("language_code")
    .eq("user_key", String((identity.data as { user_key?: unknown }).user_key || "")).maybeSingle();
  const stored = user.data && typeof (user.data as { language_code?: unknown }).language_code === "string"
    ? String((user.data as { language_code?: unknown }).language_code)
    : null;
  return resolveOrganizerSurveyLanguage(stored);
};

const resolveTelegramActor = async (supabase: SupabaseClient, telegramUserId: number) => {
  const identity = await supabase.from("user_provider_identities").select("user_key")
    .eq("provider", "telegram")
    .eq("provider_user_id", String(telegramUserId))
    .eq("status", "active")
    .not("consented_at", "is", null)
    .maybeSingle();
  return !identity.error && identity.data
    ? String((identity.data as { user_key?: unknown }).user_key || "")
    : "";
};

const schedulePostEventCompletionCleanup = async ({
  supabase,
  telegramUserId,
  activityId,
  messageId,
}: {
  supabase: SupabaseClient;
  telegramUserId: number;
  activityId: string;
  messageId: number;
}) => {
  const result = await supabase.rpc("go_irl_schedule_post_event_telegram_cleanup", {
    p_telegram_user_id: String(telegramUserId),
    p_activity_id: activityId,
    p_provider_message_id: String(messageId),
  });
  return !result.error;
};

const editableDraftMetadata = (metadata: Record<string, unknown> | null, promptId: string) => ({
  ...(metadata || {}),
  repeatPublication: {
    enabled: false,
    sourcePromptId: promptId,
    editableDraft: true,
  },
});

const createEditableRepeatDraft = async ({
  supabase,
  promptId,
  prompt,
  actorUserKey,
}: {
  supabase: SupabaseClient;
  promptId: string;
  prompt: RepeatPromptContext;
  actorUserKey: string;
}): Promise<RepeatDecisionRow> => {
  if (prompt.status === "yes" && prompt.next_activity_id) {
    return { created_activity_id: prompt.next_activity_id, duplicate: true, published: false, visibility: "private" };
  }
  if (prompt.status === "no" || prompt.status === "expired" || prompt.status === "cancelled") {
    throw new Error("repeat_prompt_already_decided");
  }
  if (new Date(prompt.expires_at).getTime() <= Date.now()) {
    await supabase.from("activity_repeat_publication_prompts").update({
      status: "expired", leased_at: null, next_attempt_at: null, updated_at: new Date().toISOString(),
    }).eq("id", promptId).eq("organizer_key", actorUserKey);
    throw new Error("repeat_prompt_expired");
  }

  const claimed = await supabase.from("activity_repeat_publication_prompts").update({
    status: "sending",
    leased_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", promptId).eq("organizer_key", actorUserKey).in("status", ["sent", "failed"])
    .select("id").maybeSingle();

  if (claimed.error || !claimed.data) {
    const current = await supabase.from("activity_repeat_publication_prompts")
      .select("status,next_activity_id").eq("id", promptId).maybeSingle();
    if (!current.error && current.data
      && String((current.data as { status?: unknown }).status || "") === "yes"
      && typeof (current.data as { next_activity_id?: unknown }).next_activity_id === "string") {
      return {
        created_activity_id: String((current.data as { next_activity_id?: unknown }).next_activity_id),
        duplicate: true,
        published: false,
        visibility: "private",
      };
    }
    throw new Error("repeat_prompt_busy");
  }

  try {
    const existing = await supabase.from("activities")
      .select("id,visibility")
      .eq("organizer_key", actorUserKey)
      .contains("metadata", { repeatPublication: { sourcePromptId: promptId, editableDraft: true } })
      .limit(1);
    let draftId = !existing.error && existing.data?.[0]
      ? String((existing.data[0] as { id?: unknown }).id || "")
      : "";

    if (!draftId) {
      const sourceResult = await supabase.from("activities").select([
        "category_id", "activity_ru", "activity_cs", "title_ru", "title_cs",
        "description_ru", "description_cs", "event_date", "event_time", "city_id",
        "address", "location_url", "participant_note", "activity_type", "metadata",
        "price", "capacity", "organizer", "organizer_key",
      ].join(",")).eq("id", prompt.source_activity_id).maybeSingle();
      if (sourceResult.error || !sourceResult.data) throw new Error("repeat_source_missing");
      const source = sourceResult.data as RepeatSourceActivity;
      if (source.organizer_key !== actorUserKey) throw new Error("repeat_source_owner_mismatch");

      const inserted = await supabase.from("activities").insert({
        category_id: source.category_id,
        activity_ru: source.activity_ru,
        activity_cs: source.activity_cs,
        title_ru: source.title_ru,
        title_cs: source.title_cs,
        description_ru: source.description_ru,
        description_cs: source.description_cs,
        event_date: shiftIsoDate(source.event_date, 7),
        event_time: source.event_time,
        city_id: source.city_id,
        address: source.address,
        location_url: source.location_url,
        participant_note: source.participant_note,
        activity_type: source.activity_type,
        metadata: editableDraftMetadata(source.metadata, promptId),
        price: source.price,
        capacity: source.capacity,
        organizer: source.organizer,
        organizer_key: source.organizer_key,
        visibility: "private",
        urgent: false,
        popular: false,
        series_id: null,
        series_occurrence_no: null,
        series_occurrence_status: null,
      }).select("id").single();
      if (inserted.error || !inserted.data) throw inserted.error || new Error("repeat_draft_create_failed");
      draftId = String((inserted.data as { id?: unknown }).id || "");
      if (!draftId) throw new Error("repeat_draft_id_missing");

      const member = await supabase.from("activity_members").insert({
        activity_id: draftId,
        user_key: source.organizer_key,
        display_name: source.organizer,
        status: "joined",
      });
      if (member.error) throw member.error;
    }

    const finalized = await supabase.from("activity_repeat_publication_prompts").update({
      status: "yes",
      decided_at: new Date().toISOString(),
      next_activity_id: draftId,
      leased_at: null,
      next_attempt_at: null,
      last_error_code: null,
      updated_at: new Date().toISOString(),
    }).eq("id", promptId).eq("organizer_key", actorUserKey).eq("status", "sending");
    if (finalized.error) throw finalized.error;

    return { created_activity_id: draftId, duplicate: false, published: false, visibility: "private" };
  } catch (error) {
    await supabase.from("activity_repeat_publication_prompts").update({
      status: "failed",
      leased_at: null,
      next_attempt_at: null,
      last_error_code: error instanceof Error ? error.message.slice(0, 80) : "repeat_draft_failed",
      updated_at: new Date().toISOString(),
    }).eq("id", promptId).eq("organizer_key", actorUserKey).eq("status", "sending");
    throw error;
  }
};

export const sendDueRepeatPublicationPrompts = async ({
  supabase,
  telegramApi,
  limit = 50,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  limit?: number;
}) => {
  const claimed = await supabase.rpc("go_irl_claim_due_repeat_publication_prompts", {
    p_limit: limit,
    p_lease_seconds: 300,
  });
  if (claimed.error) throw claimed.error;

  const prompts = (claimed.data || []) as RepeatPromptRow[];
  let sent = 0;
  let retried = 0;
  let failed = 0;

  for (const prompt of prompts) {
    const text = `Для повторной публикации события ${cityLabel(prompt.city_id)} / ${prompt.title} / ${dateLabel(prompt.event_date)}${timeLabel(prompt.event_time) ? ` в ${timeLabel(prompt.event_time)}` : ""} нажми Да.`;
    try {
      const message = await telegramApi<{ message_id: number }>("sendMessage", {
        chat_id: Number(prompt.telegram_user_id),
        text,
        reply_markup: {
          inline_keyboard: [[
            { text: "Да", callback_data: `repeat:${prompt.prompt_id}:yes` },
            { text: "Нет", callback_data: `repeat:${prompt.prompt_id}:no` },
          ]],
        },
      });
      const finished = await supabase.rpc("go_irl_finish_repeat_publication_prompt", {
        p_prompt_id: prompt.prompt_id,
        p_outcome: "sent",
        p_telegram_message_id: message.message_id,
        p_error_code: null,
        p_retry_at: null,
      });
      if (finished.error) throw finished.error;
      sent += 1;
    } catch (error) {
      const attemptCount = 1;
      const retryAt = new Date(Date.now() + retryDelaySeconds(attemptCount) * 1000).toISOString();
      const finished = await supabase.rpc("go_irl_finish_repeat_publication_prompt", {
        p_prompt_id: prompt.prompt_id,
        p_outcome: "retry",
        p_telegram_message_id: null,
        p_error_code: error instanceof Error ? error.message.slice(0, 80) : "telegram_send_failed",
        p_retry_at: retryAt,
      });
      if (finished.error) {
        failed += 1;
      } else {
        retried += 1;
      }
    }
  }

  return { claimed: prompts.length, sent, retried, failed };
};

export const handleRepeatPublicationCallback = async ({
  supabase,
  telegramApi,
  callbackQuery,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  callbackQuery: RepeatCallbackQuery;
  publishPublicActivity: (activity: ActivityRow) => Promise<void>;
}) => {
  const parsed = parseRepeatPublicationCallback(callbackQuery.data);
  if (!parsed) return { handled: false } as const;

  const callbackId = callbackQuery.id;
  const telegramUserId = callbackQuery.from?.id;
  if (!callbackId || !Number.isSafeInteger(telegramUserId)) {
    return { handled: true, rejected: "invalid_callback" } as const;
  }

  const promptContextResult = await supabase.from("activity_repeat_publication_prompts")
    .select("source_activity_id,organizer_key,status,expires_at,telegram_message_id,next_activity_id")
    .eq("id", parsed.promptId).maybeSingle();
  const promptContext = !promptContextResult.error && promptContextResult.data
    ? promptContextResult.data as RepeatPromptContext
    : null;
  const postEventInline = promptContext?.telegram_message_id == null;

  let row: RepeatDecisionRow | null = null;
  if (parsed.decision === "yes") {
    const actorUserKey = await resolveTelegramActor(supabase, telegramUserId as number);
    if (!promptContext || !actorUserKey || actorUserKey !== promptContext.organizer_key) {
      await telegramApi<boolean>("answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "Не удалось обработать ответ. Попробуйте ещё раз.",
        show_alert: true,
      });
      return { handled: true, rejected: "decision_failed" } as const;
    }
    try {
      row = await createEditableRepeatDraft({
        supabase,
        promptId: parsed.promptId,
        prompt: promptContext,
        actorUserKey,
      });
    } catch {
      await telegramApi<boolean>("answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "Не удалось подготовить черновик. Попробуйте ещё раз.",
        show_alert: true,
      });
      return { handled: true, rejected: "draft_failed" } as const;
    }
  } else {
    const decision = await supabase.rpc("go_irl_repeat_publication_decision", {
      p_prompt_id: parsed.promptId,
      p_telegram_user_id: String(telegramUserId),
      p_decision: parsed.decision,
    });
    if (decision.error) {
      await telegramApi<boolean>("answerCallbackQuery", {
        callback_query_id: callbackId,
        text: "Не удалось обработать ответ. Попробуйте ещё раз.",
        show_alert: true,
      });
      return { handled: true, rejected: "decision_failed" } as const;
    }
    row = ((decision.data || [])[0] || null) as RepeatDecisionRow | null;
  }

  if (!row) {
    await telegramApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: "Ответ больше не актуален.",
    });
    return { handled: true, rejected: "decision_missing" } as const;
  }

  if (postEventInline && promptContext && callbackQuery.message?.chat?.id && callbackQuery.message.message_id) {
    const language = await resolvePostEventLanguage(supabase, telegramUserId as number);
    const oldMessageId = callbackQuery.message.message_id;
    let completionMessageId = oldMessageId;
    const draftCopy = editableDraftCopy[language];
    const completion = parsed.decision === "yes"
      ? `${organizerSurveyCopy[language].completion}\n\n${row.duplicate ? draftCopy.duplicate : draftCopy.ready}`
      : organizerSurveyCopy[language].completion;
    const replyMarkup = parsed.decision === "yes" && row.created_activity_id
      ? { inline_keyboard: [[{ text: draftCopy.button, url: draftEditUrl(row.created_activity_id) }]] }
      : { inline_keyboard: [] };

    await telegramApi<boolean>("answerCallbackQuery", { callback_query_id: callbackId });
    try {
      await telegramApi<boolean>("editMessageText", {
        chat_id: callbackQuery.message.chat.id,
        message_id: oldMessageId,
        text: completion,
        reply_markup: replyMarkup,
      });
    } catch {
      try {
        await telegramApi<boolean>("deleteMessage", {
          chat_id: callbackQuery.message.chat.id,
          message_id: oldMessageId,
        });
      } catch {
        // Decision is durable; obsolete-message deletion is best-effort only.
      }
      const sent = await telegramApi<{ message_id: number }>("sendMessage", {
        chat_id: callbackQuery.message.chat.id,
        text: completion,
        ...(replyMarkup.inline_keyboard.length ? { reply_markup: replyMarkup } : {}),
      });
      completionMessageId = sent.message_id;
      await supabase.rpc("go_irl_update_post_event_telegram_message_id", {
        p_telegram_user_id: String(telegramUserId),
        p_activity_id: promptContext.source_activity_id,
        p_previous_message_id: String(oldMessageId),
        p_new_message_id: String(completionMessageId),
      });
    }
    const cleanupScheduled = await schedulePostEventCompletionCleanup({
      supabase,
      telegramUserId: telegramUserId as number,
      activityId: promptContext.source_activity_id,
      messageId: completionMessageId,
    });
    return {
      handled: true,
      duplicate: row.duplicate,
      createdActivityId: row.created_activity_id,
      decision: parsed.decision,
      cleanupScheduled,
    } as const;
  }

  const language = await resolvePostEventLanguage(supabase, telegramUserId as number);
  const draftCopy = editableDraftCopy[language];
  const answer = parsed.decision === "yes"
    ? row.duplicate ? draftCopy.duplicate : draftCopy.ready
    : row.duplicate ? "Ответ уже сохранён." : "Повторение остановлено.";
  await telegramApi<boolean>("answerCallbackQuery", {
    callback_query_id: callbackId,
    text: answer,
  });

  if (callbackQuery.message?.chat?.id && callbackQuery.message.message_id) {
    try {
      await telegramApi<boolean>("editMessageReplyMarkup", {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: parsed.decision === "yes" && row.created_activity_id
          ? { inline_keyboard: [[{ text: draftCopy.button, url: draftEditUrl(row.created_activity_id) }]] }
          : { inline_keyboard: [] },
      });
    } catch {
      // Callback decision is durable; keyboard cleanup is best-effort only.
    }
  }

  return {
    handled: true,
    duplicate: row.duplicate,
    createdActivityId: row.created_activity_id,
    decision: parsed.decision,
  } as const;
};
