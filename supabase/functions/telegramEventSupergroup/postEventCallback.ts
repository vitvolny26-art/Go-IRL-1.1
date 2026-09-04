import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

type TelegramApi = <T>(method: string, body?: Record<string, unknown>) => Promise<T>;

type TelegramInlineButton = {
  text?: string;
  url?: string;
  callback_data?: string;
};

type PostEventCallbackQuery = {
  id?: string;
  data?: string;
  from?: { id?: number };
  message?: {
    chat?: { id?: number };
    message_id?: number;
    reply_markup?: {
      inline_keyboard?: TelegramInlineButton[][];
    };
  };
};

const uuid = "([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})";
const organizerPattern = new RegExp(`^pe:o:${uuid}:(h|n|p)$`, "i");
const participantPattern = new RegExp(`^pe:p:${uuid}:(a|x|n)$`, "i");

const organizerValues = {
  h: "happened",
  n: "did_not_happen",
  p: "problem",
} as const;

const participantValues = {
  a: "attended",
  x: "absent",
  n: "event_did_not_happen",
} as const;

export type ParsedPostEventCallback =
  | { action: "organizer_outcome"; targetId: string; value: "happened" | "did_not_happen" | "problem" }
  | { action: "participant_confirmation"; targetId: string; value: "attended" | "absent" | "event_did_not_happen" };

export const parsePostEventCallback = (value: string | undefined): ParsedPostEventCallback | null => {
  const organizer = value?.match(organizerPattern);
  if (organizer) {
    return {
      action: "organizer_outcome",
      targetId: organizer[1].toLowerCase(),
      value: organizerValues[organizer[2].toLowerCase() as keyof typeof organizerValues],
    };
  }

  const participant = value?.match(participantPattern);
  if (participant) {
    return {
      action: "participant_confirmation",
      targetId: participant[1].toLowerCase(),
      value: participantValues[participant[2].toLowerCase() as keyof typeof participantValues],
    };
  }

  return null;
};

const retainedUrlKeyboard = (callbackQuery: PostEventCallbackQuery) => {
  const rows = callbackQuery.message?.reply_markup?.inline_keyboard || [];
  const retained = rows
    .map((row) => row.filter((button) => typeof button.url === "string" && button.url.length > 0))
    .filter((row) => row.length > 0);
  return { inline_keyboard: retained };
};

const successText = (parsed: ParsedPostEventCallback) => {
  if (parsed.action === "organizer_outcome") {
    if (parsed.value === "happened") return "Событие отмечено как состоявшееся. Подтвердите участников в GO IRL.";
    if (parsed.value === "did_not_happen") return "Сохранено: событие не состоялось.";
    return "Сохранено. Ситуация отмечена как проблемная.";
  }

  if (parsed.value === "attended") return "Спасибо. Участие подтверждено.";
  if (parsed.value === "absent") return "Сохранено: вы не участвовали.";
  return "Сохранено: по вашему ответу событие не состоялось.";
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

  const result = await supabase.rpc("go_irl_post_event_telegram_action", {
    p_telegram_user_id: String(telegramUserId),
    p_action: parsed.action,
    p_target_id: parsed.targetId,
    p_value: parsed.value,
  });

  if (result.error) {
    await telegramApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: "Не удалось обработать ответ. Откройте GO IRL или попробуйте ещё раз.",
      show_alert: true,
    });
    return { handled: true, rejected: "action_failed" } as const;
  }

  await telegramApi<boolean>("answerCallbackQuery", {
    callback_query_id: callbackId,
    text: successText(parsed),
  });

  if (callbackQuery.message?.chat?.id && callbackQuery.message.message_id) {
    try {
      await telegramApi<boolean>("editMessageReplyMarkup", {
        chat_id: callbackQuery.message.chat.id,
        message_id: callbackQuery.message.message_id,
        reply_markup: retainedUrlKeyboard(callbackQuery),
      });
    } catch {
      // Mutation is durable; action-button cleanup is best-effort only.
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
