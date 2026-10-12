/**
 * Activ020: evidence from Telegram webhook, never from a Mini App client.
 * chosen_inline_result updates require bot inline feedback to be enabled.
 * A successful shareMessage callback must not be treated as this evidence.
 */
export type TelegramChosenInlineResult = {
  result_id?: unknown;
  from?: { id?: unknown };
  inline_message_id?: unknown;
};

export const matchesPreparedInviteDelivery = (
  update: { chosen_inline_result?: TelegramChosenInlineResult },
  expected: { resultId: string; telegramUserId: number },
): boolean => {
  const chosen = update.chosen_inline_result;
  return Boolean(chosen
    && expected.resultId.length >= 1
    && Number.isSafeInteger(expected.telegramUserId)
    && expected.telegramUserId > 0
    && chosen.result_id === expected.resultId
    && chosen.from?.id === expected.telegramUserId
    && typeof chosen.inline_message_id === "string"
    && chosen.inline_message_id.length > 0);
};
