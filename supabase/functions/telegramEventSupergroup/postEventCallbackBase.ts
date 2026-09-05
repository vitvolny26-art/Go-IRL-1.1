import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";
import {
  buildOrganizerSurveyKeyboard,
  buildOrganizerSurveyText,
  organizerSurveyCopy,
  resolveOrganizerSurveyLanguage,
  type OrganizerSurveyLanguage,
  type OrganizerSurveyRosterRow,
  type OrganizerSurveyStep,
} from "../../../api/_shared/post-event-organizer-survey.ts";

type TelegramApi = <T>(method: string, body?: Record<string, unknown>) => Promise<T>;

type TelegramInlineButton = {
  text?: string;
  url?: string;
  callback_data?: string;
};

type PostEventCallbackQuery = {
  id?: string;
  data?: string;
  from?: { id?: number; language_code?: string };
  message?: {
    chat?: { id?: number };
    message_id?: number;
    reply_markup?: {
      inline_keyboard?: TelegramInlineButton[][];
    };
  };
};

const uuid = "([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})";
const organizerLegacyPattern = new RegExp(`^pe:o:${uuid}:(h|n|p)$`, "i");
const participantPattern = new RegExp(`^pe:p:${uuid}:(a|x|n)$`, "i");
const organizerQ1Pattern = new RegExp(`^pe:q1:${uuid}:(y|n)$`, "i");
const organizerQ2Pattern = new RegExp(`^pe:q2:${uuid}:(g|p)$`, "i");
const organizerQ3Pattern = new RegExp(`^pe:q3:${uuid}:(a|n)$`, "i");
const organizerQ4Pattern = new RegExp(`^pe:q4:${uuid}:(a|p)$`, "i");
const organizerQ4DonePattern = new RegExp(`^pe:q4d:${uuid}$`, "i");

const organizerLegacyValues = { h: "happened", n: "did_not_happen", p: "problem" } as const;
const participantValues = { a: "attended", x: "absent", n: "event_did_not_happen" } as const;
const organizerQ1Values = { y: "happened", n: "did_not_happen" } as const;
const organizerQ2Values = { g: "good", p: "had_problems" } as const;
const organizerQ3Values = { a: "all_came", n: "no_shows" } as const;
const organizerQ4Values = { a: "absent", p: "present" } as const;

export type ParsedPostEventCallback =
  | { action: "organizer_outcome"; targetId: string; value: "happened" | "did_not_happen" | "problem"; survey: false }
  | { action: "participant_confirmation"; targetId: string; value: "attended" | "absent" | "event_did_not_happen"; survey: false }
  | { action: "organizer_survey_outcome"; targetId: string; value: "happened" | "did_not_happen"; survey: true }
  | { action: "organizer_experience"; targetId: string; value: "good" | "had_problems"; survey: true }
  | { action: "organizer_attendance_summary"; targetId: string; value: "all_came" | "no_shows"; survey: true }
  | { action: "organizer_absence"; targetId: string; value: "absent" | "present"; survey: true }
  | { action: "organizer_finalize"; targetId: string; value: "done"; survey: true };

export const parsePostEventCallback = (value: string | undefined): ParsedPostEventCallback | null => {
  const q1 = value?.match(organizerQ1Pattern);
  if (q1) return {
    action: "organizer_survey_outcome",
    targetId: q1[1].toLowerCase(),
    value: organizerQ1Values[q1[2].toLowerCase() as keyof typeof organizerQ1Values],
    survey: true,
  };

  const q2 = value?.match(organizerQ2Pattern);
  if (q2) return {
    action: "organizer_experience",
    targetId: q2[1].toLowerCase(),
    value: organizerQ2Values[q2[2].toLowerCase() as keyof typeof organizerQ2Values],
    survey: true,
  };

  const q3 = value?.match(organizerQ3Pattern);
  if (q3) return {
    action: "organizer_attendance_summary",
    targetId: q3[1].toLowerCase(),
    value: organizerQ3Values[q3[2].toLowerCase() as keyof typeof organizerQ3Values],
    survey: true,
  };

  const q4 = value?.match(organizerQ4Pattern);
  if (q4) return {
    action: "organizer_absence",
    targetId: q4[1].toLowerCase(),
    value: organizerQ4Values[q4[2].toLowerCase() as keyof typeof organizerQ4Values],
    survey: true,
  };

  const q4Done = value?.match(organizerQ4DonePattern);
  if (q4Done) return {
    action: "organizer_finalize",
    targetId: q4Done[1].toLowerCase(),
    value: "done",
    survey: true,
  };

  const organizer = value?.match(organizerLegacyPattern);
  if (organizer) return {
    action: "organizer_outcome",
    targetId: organizer[1].toLowerCase(),
    value: organizerLegacyValues[organizer[2].toLowerCase() as keyof typeof organizerLegacyValues],
    survey: false,
  };

  const participant = value?.match(participantPattern);
  if (participant) return {
    action: "participant_confirmation",
    targetId: participant[1].toLowerCase(),
    value: participantValues[participant[2].toLowerCase() as keyof typeof participantValues],
    survey: false,
  };

  return null;
};

const resolveCallbackLanguage = async (
  supabase: SupabaseClient,
  telegramUserId: number,
  callbackLanguage: string | undefined,
): Promise<OrganizerSurveyLanguage> => {
  const identityResult = await supabase
    .from("user_provider_identities")
    .select("user_key")
    .eq("provider", "telegram")
    .eq("provider_user_id", String(telegramUserId))
    .eq("status", "active")
    .not("consented_at", "is", null)
    .maybeSingle();
  if (identityResult.error || !identityResult.data) {
    return resolveOrganizerSurveyLanguage(null, callbackLanguage);
  }

  const userResult = await supabase
    .from("app_users")
    .select("language_code")
    .eq("user_key", String((identityResult.data as { user_key?: unknown }).user_key || ""))
    .maybeSingle();
  const storedLanguage = userResult.data && typeof (userResult.data as { language_code?: unknown }).language_code === "string"
    ? String((userResult.data as { language_code?: unknown }).language_code)
    : null;
  return resolveOrganizerSurveyLanguage(storedLanguage, callbackLanguage);
};

const retainedUrlKeyboard = (callbackQuery: PostEventCallbackQuery) => {
  const rows = callbackQuery.message?.reply_markup?.inline_keyboard || [];
  const retained = rows
    .map((row) => row.filter((button) => typeof button.url === "string" && button.url.length > 0))
    .filter((row) => row.length > 0);
  return { inline_keyboard: retained };
};

const rowFrom = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const surveyStateFrom = (data: unknown) => {
  const root = rowFrom(data);
  const state = rowFrom(root?.state);
  if (!state) return null;
  const activityId = typeof state.activityId === "string" ? state.activityId : "";
  const nextStep = typeof state.nextStep === "string" ? state.nextStep as OrganizerSurveyStep : null;
  if (!activityId || !nextStep || !["outcome", "experience", "attendance", "no_shows", "complete"].includes(nextStep)) return null;
  const roster = Array.isArray(state.roster)
    ? state.roster.flatMap((item): OrganizerSurveyRosterRow[] => {
      const row = rowFrom(item);
      if (!row || typeof row.feedbackId !== "string") return [];
      return [{
        feedbackId: row.feedbackId,
        displayName: typeof row.displayName === "string" && row.displayName.trim() ? row.displayName.trim() : "GO IRL User",
        absent: row.absent === true,
      }];
    })
    : [];
  return { activityId, nextStep, roster };
};

const replaceSurveyMessage = async ({
  telegramApi,
  callbackQuery,
  text,
  replyMarkup,
}: {
  telegramApi: TelegramApi;
  callbackQuery: PostEventCallbackQuery;
  text: string;
  replyMarkup: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
}) => {
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;
  if (!chatId || !messageId) throw new Error("post_event_message_context_required");

  try {
    await telegramApi<boolean>("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: replyMarkup,
    });
    return messageId;
  } catch {
    try {
      await telegramApi<boolean>("deleteMessage", { chat_id: chatId, message_id: messageId });
    } catch {
      // The answer is durable. Obsolete-message deletion is best-effort only.
    }

    const sent = await telegramApi<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text,
      ...(replyMarkup.inline_keyboard.length ? { reply_markup: replyMarkup } : {}),
    });
    if (!Number.isSafeInteger(sent.message_id)) throw new Error("post_event_replacement_message_id_missing");
    return sent.message_id;
  }
};

const persistMessageAnchor = async ({
  supabase,
  telegramUserId,
  activityId,
  previousMessageId,
  newMessageId,
}: {
  supabase: SupabaseClient;
  telegramUserId: number;
  activityId: string;
  previousMessageId: number;
  newMessageId: number;
}) => {
  const result = await supabase.rpc("go_irl_update_post_event_telegram_message_id", {
    p_telegram_user_id: String(telegramUserId),
    p_activity_id: activityId,
    p_previous_message_id: String(previousMessageId),
    p_new_message_id: String(newMessageId),
  });
  return !result.error && result.data === true;
};

const scheduleCompletionCleanup = async ({
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

const localizedLegacySuccess = (parsed: ParsedPostEventCallback, language: OrganizerSurveyLanguage) => {
  const copy = organizerSurveyCopy[language];
  if (parsed.action === "participant_confirmation") {
    if (parsed.value === "attended") return copy.attendanceConfirmed;
    if (parsed.value === "absent") return copy.attendanceAbsent;
    return copy.eventMissing;
  }
  return copy.saved;
};

export const handlePostEventCallback = async ({
  supabase,
  telegramApi,
  callbackQuery,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  callbackQuery: PostEventCallbackQuery;
}) => {
  const parsed = parsePostEventCallback(callbackQuery.data);
  if (!parsed) return { handled: false } as const;

  const callbackId = callbackQuery.id;
  const telegramUserId = callbackQuery.from?.id;
  if (!callbackId || !Number.isSafeInteger(telegramUserId)) {
    return { handled: true, rejected: "invalid_callback" } as const;
  }

  const language = await resolveCallbackLanguage(
    supabase,
    telegramUserId as number,
    callbackQuery.from?.language_code,
  );
  const text = organizerSurveyCopy[language];

  const result = await supabase.rpc("go_irl_post_event_telegram_action", {
    p_telegram_user_id: String(telegramUserId),
    p_action: parsed.action,
    p_target_id: parsed.targetId,
    p_value: parsed.value,
  });

  if (result.error) {
    const selectAbsent = parsed.action === "organizer_finalize"
      && /select at least one absent participant/i.test(result.error.message || "");
    await telegramApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: selectAbsent ? text.selectAbsent : text.failed,
      show_alert: true,
    });
    return { handled: true, rejected: selectAbsent ? "absent_required" : "action_failed" } as const;
  }

  if (parsed.survey) {
    const state = surveyStateFrom(result.data);
    const oldMessageId = callbackQuery.message?.message_id;
    if (!state || !oldMessageId || !callbackQuery.message?.chat?.id) {
      await telegramApi<boolean>("answerCallbackQuery", {
        callback_query_id: callbackId,
        text: text.failed,
        show_alert: true,
      });
      return { handled: true, rejected: "survey_state_invalid" } as const;
    }

    const resultRoot = rowFrom(result.data);
    const storedLanguage = typeof resultRoot?.languageCode === "string" ? resultRoot.languageCode : null;
    const stateLanguage = resolveOrganizerSurveyLanguage(storedLanguage, callbackQuery.from?.language_code);
    const nextText = buildOrganizerSurveyText(stateLanguage, state.nextStep);
    const keyboard = buildOrganizerSurveyKeyboard(stateLanguage, state.nextStep, state.activityId, state.roster);

    await telegramApi<boolean>("answerCallbackQuery", { callback_query_id: callbackId });

    let newMessageId: number;
    try {
      newMessageId = await replaceSurveyMessage({ telegramApi, callbackQuery, text: nextText, replyMarkup: keyboard });
    } catch {
      return {
        handled: true,
        action: parsed.action,
        targetId: parsed.targetId,
        value: parsed.value,
        state,
        presentation: "failed",
      } as const;
    }

    const messageAnchorPersisted = await persistMessageAnchor({
      supabase,
      telegramUserId: telegramUserId as number,
      activityId: state.activityId,
      previousMessageId: oldMessageId,
      newMessageId,
    });

    const cleanupScheduled = state.nextStep === "complete"
      ? await scheduleCompletionCleanup({
        supabase,
        telegramUserId: telegramUserId as number,
        activityId: state.activityId,
        messageId: newMessageId,
      })
      : false;

    return {
      handled: true,
      action: parsed.action,
      targetId: parsed.targetId,
      value: parsed.value,
      state,
      messageAnchorPersisted,
      ...(state.nextStep === "complete" ? { cleanupScheduled } : {}),
    } as const;
  }

  await telegramApi<boolean>("answerCallbackQuery", {
    callback_query_id: callbackId,
    text: localizedLegacySuccess(parsed, language),
  });

  if (callbackQuery.message?.chat?.id && callbackQuery.message.message_id) {
    try {
      await telegramApi<boolean>("editMessageReplyMarkup", {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: retainedUrlKeyboard(callbackQuery),
      });
    } catch {
      // Legacy mutation is durable; action-button cleanup is best-effort only.
    }
  }

  return {
    handled: true,
    action: parsed.action,
    targetId: parsed.targetId,
    value: parsed.value,
    result: result.data ?? null,
  } as const;
};
