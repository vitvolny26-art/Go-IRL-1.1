import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

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

const callbackPattern = /^repeat:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}):(yes|no)$/i;

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
  publishPublicActivity,
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

  const row = ((decision.data || [])[0] || null) as RepeatDecisionRow | null;
  if (!row) {
    await telegramApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: "Ответ больше не актуален.",
    });
    return { handled: true, rejected: "decision_missing" } as const;
  }

  if (parsed.decision === "yes" && row.created_activity_id && !row.duplicate && row.visibility === "public") {
    const activityResult = await supabase
      .from("activities")
      .select("id,title_ru,title_cs,event_date,event_time,city_id,address,visibility")
      .eq("id", row.created_activity_id)
      .maybeSingle();
    if (!activityResult.error && activityResult.data) {
      await publishPublicActivity(activityResult.data as ActivityRow);
    }
  }

  const answer = parsed.decision === "yes"
    ? row.duplicate ? "Событие уже опубликовано." : "Следующее событие опубликовано."
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
        reply_markup: { inline_keyboard: [] },
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
