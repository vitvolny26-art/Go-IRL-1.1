type SupabaseRpcResult = { data: unknown; error: { message?: string } | null };
type SupabaseClient = { rpc: (name: string, args: Record<string, unknown>) => Promise<SupabaseRpcResult> };

type TelegramApi = <T>(method: string, body?: Record<string, unknown>) => Promise<T>;
type TelegramInlineButton = { text: string; callback_data: string };
type ParticipantSurveyLanguage = "ru" | "uk" | "cs" | "en" | "pl" | "sk";
type ParticipantSurveyStep = "rating" | "issues" | "peers" | "repeat_intent" | "complete";

type PostEventCallbackQuery = {
  id?: string;
  data?: string;
  from?: { id?: number; language_code?: string };
  message?: { chat?: { id?: number }; message_id?: number };
};

type ParticipantSurveyState = {
  feedbackId: string;
  activityId: string;
  nextStep: ParticipantSurveyStep;
  issueTags: string[];
  peerSample: Array<{ feedbackId: string; displayName: string; confirmed: boolean }>;
};

export type ParsedParticipantPostEventSurveyCallback = {
  action:
    | "participant_survey_attendance"
    | "participant_rating"
    | "participant_issue_tag"
    | "participant_issue_done"
    | "participant_peer_presence"
    | "participant_peer_done"
    | "participant_repeat_intent";
  targetId: string;
  value: string;
};

const copy: Record<ParticipantSurveyLanguage, {
  rating: string;
  issues: string;
  peers: string;
  repeat: string;
  completion: string;
  done: string;
  yes: string;
  no: string;
  failed: string;
  issueLabels: Record<"organization" | "communication" | "punctuality" | "safety" | "other", string>;
}> = {
  ru: {
    rating: "Оцените организатора", issues: "Что было не так?",
    peers: "Кого из этих участников вы видели на событии?",
    repeat: "Хотите ещё участвовать в таких событиях?", completion: "Спасибо за обратную связь!",
    done: "Готово", yes: "Да", no: "Нет", failed: "Не удалось обработать ответ. Попробуйте ещё раз.",
    issueLabels: { organization: "Организация", communication: "Коммуникация", punctuality: "Пунктуальность", safety: "Безопасность", other: "Другое" },
  },
  uk: {
    rating: "Оцініть організатора", issues: "Що було не так?",
    peers: "Кого з цих учасників ви бачили на події?",
    repeat: "Хочете ще брати участь у таких подіях?", completion: "Дякуємо за відгук!",
    done: "Готово", yes: "Так", no: "Ні", failed: "Не вдалося обробити відповідь. Спробуйте ще раз.",
    issueLabels: { organization: "Організація", communication: "Комунікація", punctuality: "Пунктуальність", safety: "Безпека", other: "Інше" },
  },
  cs: {
    rating: "Ohodnoťte organizátora", issues: "Co nebylo v pořádku?",
    peers: "Koho z těchto účastníků jste na události viděli?",
    repeat: "Chcete se podobných událostí účastnit znovu?", completion: "Děkujeme za zpětnou vazbu!",
    done: "Hotovo", yes: "Ano", no: "Ne", failed: "Odpověď se nepodařilo zpracovat. Zkuste to znovu.",
    issueLabels: { organization: "Organizace", communication: "Komunikace", punctuality: "Dochvilnost", safety: "Bezpečnost", other: "Jiné" },
  },
  en: {
    rating: "Rate the organizer", issues: "What went wrong?",
    peers: "Which of these participants did you see at the event?",
    repeat: "Would you join events like this again?", completion: "Thanks for your feedback!",
    done: "Done", yes: "Yes", no: "No", failed: "Could not process the answer. Please try again.",
    issueLabels: { organization: "Organization", communication: "Communication", punctuality: "Punctuality", safety: "Safety", other: "Other" },
  },
  pl: {
    rating: "Oceń organizatora", issues: "Co było nie tak?",
    peers: "Kogo z tych uczestników widziałeś(-aś) na wydarzeniu?",
    repeat: "Czy chcesz ponownie uczestniczyć w takich wydarzeniach?", completion: "Dziękujemy za opinię!",
    done: "Gotowe", yes: "Tak", no: "Nie", failed: "Nie udało się przetworzyć odpowiedzi. Spróbuj ponownie.",
    issueLabels: { organization: "Organizacja", communication: "Komunikacja", punctuality: "Punktualność", safety: "Bezpieczeństwo", other: "Inne" },
  },
  sk: {
    rating: "Ohodnoťte organizátora", issues: "Čo nebolo v poriadku?",
    peers: "Koho z týchto účastníkov ste na udalosti videli?",
    repeat: "Chcete sa podobných udalostí zúčastniť znova?", completion: "Ďakujeme za spätnú väzbu!",
    done: "Hotovo", yes: "Áno", no: "Nie", failed: "Odpoveď sa nepodarilo spracovať. Skúste to znova.",
    issueLabels: { organization: "Organizácia", communication: "Komunikácia", punctuality: "Dochvíľnosť", safety: "Bezpečnosť", other: "Iné" },
  },
};

const supportedLanguage = (value: string | null | undefined): ParticipantSurveyLanguage | null => {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized.startsWith("ru")) return "ru";
  if (normalized.startsWith("uk")) return "uk";
  if (normalized.startsWith("cs")) return "cs";
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("pl")) return "pl";
  if (normalized.startsWith("sk")) return "sk";
  return null;
};

const resolveLanguage = (stored: unknown, telegram: string | undefined): ParticipantSurveyLanguage =>
  supportedLanguage(typeof stored === "string" ? stored : null) || supportedLanguage(telegram) || "en";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tokenPattern = "[A-Za-z0-9_-]{22}";

export const participantSurveyUuidToken = (uuid: string) => {
  if (!uuidPattern.test(uuid)) throw new Error("participant_survey_invalid_uuid");
  const bytes = uuid.replace(/-/g, "").match(/.{2}/g)?.map((hex) => Number.parseInt(hex, 16)) || [];
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

export const participantSurveyUuidFromToken = (token: string) => {
  if (!new RegExp(`^${tokenPattern}$`).test(token)) return null;
  try {
    const binary = atob(token.replace(/-/g, "+").replace(/_/g, "/") + "==");
    if (binary.length !== 16) return null;
    const hex = Array.from(binary, (character) => character.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    return uuidPattern.test(uuid) ? uuid : null;
  } catch {
    return null;
  }
};

const legacyAttendance = /^pe:p:([0-9a-f-]{36}):(a|x)$/i;
const rating = new RegExp(`^pe:pr:(${tokenPattern}):([1-5])$`);
const issue = new RegExp(`^pe:pi:(${tokenPattern}):(o|c|p|s|x):(0|1)$`);
const issueDone = new RegExp(`^pe:pid:(${tokenPattern})$`);
const peer = new RegExp(`^pe:pp:(${tokenPattern}):(${tokenPattern}):(0|1)$`);
const peerDone = new RegExp(`^pe:ppd:(${tokenPattern})$`);
const repeatIntent = new RegExp(`^pe:pri:(${tokenPattern}):(y|n)$`);
const issueCodes = { o: "organization", c: "communication", p: "punctuality", s: "safety", x: "other" } as const;

export const parseParticipantPostEventSurveyCallback = (
  value: string | undefined,
): ParsedParticipantPostEventSurveyCallback | null => {
  if (!value) return null;
  const initial = value.match(legacyAttendance);
  if (initial && uuidPattern.test(initial[1])) {
    return {
      action: "participant_survey_attendance",
      targetId: initial[1].toLowerCase(),
      value: initial[2].toLowerCase() === "a" ? "attended" : "absent",
    };
  }

  const parseTarget = (token: string) => participantSurveyUuidFromToken(token);
  const ratingMatch = value.match(rating);
  if (ratingMatch) {
    const targetId = parseTarget(ratingMatch[1]);
    return targetId ? { action: "participant_rating", targetId, value: ratingMatch[2] } : null;
  }
  const issueMatch = value.match(issue);
  if (issueMatch) {
    const targetId = parseTarget(issueMatch[1]);
    const tag = issueCodes[issueMatch[2] as keyof typeof issueCodes];
    return targetId ? { action: "participant_issue_tag", targetId, value: `${tag}:${issueMatch[3] === "1" ? "on" : "off"}` } : null;
  }
  const issueDoneMatch = value.match(issueDone);
  if (issueDoneMatch) {
    const targetId = parseTarget(issueDoneMatch[1]);
    return targetId ? { action: "participant_issue_done", targetId, value: "done" } : null;
  }
  const peerMatch = value.match(peer);
  if (peerMatch) {
    const targetId = parseTarget(peerMatch[1]);
    const peerId = parseTarget(peerMatch[2]);
    return targetId && peerId
      ? { action: "participant_peer_presence", targetId, value: `${peerId}:${peerMatch[3] === "1" ? "on" : "off"}` }
      : null;
  }
  const peerDoneMatch = value.match(peerDone);
  if (peerDoneMatch) {
    const targetId = parseTarget(peerDoneMatch[1]);
    return targetId ? { action: "participant_peer_done", targetId, value: "done" } : null;
  }
  const repeatMatch = value.match(repeatIntent);
  if (repeatMatch) {
    const targetId = parseTarget(repeatMatch[1]);
    return targetId ? { action: "participant_repeat_intent", targetId, value: repeatMatch[2] === "y" ? "yes" : "no" } : null;
  }
  return null;
};

const recordFrom = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

const stateFrom = (data: unknown): ParticipantSurveyState | null => {
  const root = recordFrom(data);
  const state = recordFrom(root?.state);
  if (!state) return null;

  const feedbackId = typeof state.feedbackId === "string" ? state.feedbackId : "";
  const activityId = typeof state.activityId === "string" ? state.activityId : "";
  const nextStep = typeof state.nextStep === "string" ? state.nextStep as ParticipantSurveyStep : null;
  if (!uuidPattern.test(feedbackId) || !uuidPattern.test(activityId) || !nextStep
    || !["rating", "issues", "peers", "repeat_intent", "complete"].includes(nextStep)) return null;

  const issueTags = Array.isArray(state.issueTags)
    ? state.issueTags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const peerSample = Array.isArray(state.peerSample)
    ? state.peerSample.flatMap((candidate): ParticipantSurveyState["peerSample"] => {
      const row = recordFrom(candidate);
      if (!row || typeof row.feedbackId !== "string" || !uuidPattern.test(row.feedbackId)) return [];
      return [{
        feedbackId: row.feedbackId,
        displayName: typeof row.displayName === "string" && row.displayName.trim() ? row.displayName.trim() : "GO IRL User",
        confirmed: row.confirmed === true,
      }];
    })
    : [];

  return { feedbackId, activityId, nextStep, issueTags, peerSample };
};

const rowsOfTwo = (buttons: TelegramInlineButton[]) => {
  const rows: TelegramInlineButton[][] = [];
  for (let index = 0; index < buttons.length; index += 2) rows.push(buttons.slice(index, index + 2));
  return rows;
};

const presentation = (language: ParticipantSurveyLanguage, state: ParticipantSurveyState) => {
  const labels = copy[language];
  const target = participantSurveyUuidToken(state.feedbackId);

  if (state.nextStep === "rating") {
    return {
      text: labels.rating,
      replyMarkup: { inline_keyboard: [[1, 2, 3, 4, 5].map((value) => ({
        text: String(value), callback_data: `pe:pr:${target}:${value}`,
      }))] },
    };
  }
  if (state.nextStep === "issues") {
    const definitions = [
      ["organization", "o"], ["communication", "c"], ["punctuality", "p"], ["safety", "s"], ["other", "x"],
    ] as const;
    const buttons = definitions.map(([tag, code]) => {
      const selected = state.issueTags.includes(tag);
      return {
        text: `${selected ? "✓ " : ""}${labels.issueLabels[tag]}`,
        callback_data: `pe:pi:${target}:${code}:${selected ? "0" : "1"}`,
      };
    });
    return {
      text: labels.issues,
      replyMarkup: { inline_keyboard: [...rowsOfTwo(buttons), [{ text: labels.done, callback_data: `pe:pid:${target}` }]] },
    };
  }
  if (state.nextStep === "peers") {
    const buttons = state.peerSample.map((candidate) => ({
      text: `${candidate.confirmed ? "✓ " : ""}${candidate.displayName}`,
      callback_data: `pe:pp:${target}:${participantSurveyUuidToken(candidate.feedbackId)}:${candidate.confirmed ? "0" : "1"}`,
    }));
    return {
      text: labels.peers,
      replyMarkup: { inline_keyboard: [...rowsOfTwo(buttons), [{ text: labels.done, callback_data: `pe:ppd:${target}` }]] },
    };
  }
  if (state.nextStep === "repeat_intent") {
    return {
      text: labels.repeat,
      replyMarkup: { inline_keyboard: [[
        { text: labels.yes, callback_data: `pe:pri:${target}:y` },
        { text: labels.no, callback_data: `pe:pri:${target}:n` },
      ]] },
    };
  }
  return { text: labels.completion, replyMarkup: { inline_keyboard: [] as TelegramInlineButton[][] } };
};

const replaceMessage = async (
  telegramApi: TelegramApi,
  callbackQuery: PostEventCallbackQuery,
  text: string,
  replyMarkup: { inline_keyboard: TelegramInlineButton[][] },
) => {
  const chatId = callbackQuery.message?.chat?.id;
  const messageId = callbackQuery.message?.message_id;
  if (!chatId || !messageId) throw new Error("participant_survey_message_context_required");

  try {
    await telegramApi<boolean>("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(replyMarkup.inline_keyboard.length ? { reply_markup: replyMarkup } : {}),
    });
    return messageId;
  } catch {
    try {
      await telegramApi<boolean>("deleteMessage", { chat_id: chatId, message_id: messageId });
    } catch {
      // Best-effort cleanup only; the durable survey answer has already been persisted.
    }
    const sent = await telegramApi<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      text,
      ...(replyMarkup.inline_keyboard.length ? { reply_markup: replyMarkup } : {}),
    });
    if (!Number.isSafeInteger(sent.message_id)) throw new Error("participant_survey_replacement_message_id_missing");
    return sent.message_id;
  }
};

export const handleParticipantPostEventSurveyCallback = async ({
  supabase,
  telegramApi,
  callbackQuery,
}: {
  supabase: SupabaseClient;
  telegramApi: TelegramApi;
  callbackQuery: PostEventCallbackQuery;
}) => {
  const parsed = parseParticipantPostEventSurveyCallback(callbackQuery.data);
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

  const resultRoot = recordFrom(result.data);
  const language = resolveLanguage(resultRoot?.languageCode, callbackQuery.from?.language_code);
  if (result.error) {
    await telegramApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: copy[language].failed,
      show_alert: true,
    });
    return { handled: true, rejected: "action_failed" } as const;
  }

  const state = stateFrom(result.data);
  const oldMessageId = callbackQuery.message?.message_id;
  if (!state || !oldMessageId || !callbackQuery.message?.chat?.id) {
    await telegramApi<boolean>("answerCallbackQuery", {
      callback_query_id: callbackId,
      text: copy[language].failed,
      show_alert: true,
    });
    return { handled: true, rejected: "participant_survey_state_invalid" } as const;
  }

  const next = presentation(language, state);
  await telegramApi<boolean>("answerCallbackQuery", { callback_query_id: callbackId });

  try {
    const newMessageId = await replaceMessage(telegramApi, callbackQuery, next.text, next.replyMarkup);
    const anchor = await supabase.rpc("go_irl_update_post_event_participant_telegram_message_id", {
      p_telegram_user_id: String(telegramUserId),
      p_feedback_id: state.feedbackId,
      p_previous_message_id: String(oldMessageId),
      p_new_message_id: String(newMessageId),
    });
    return {
      handled: true,
      action: parsed.action,
      targetId: parsed.targetId,
      value: parsed.value,
      state,
      messageAnchorPersisted: !anchor.error && anchor.data === true,
    } as const;
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
};
