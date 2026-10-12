/**
 * Activ020 pre-publication Telegram invitation lifecycle.
 * This is a pure guard. Server-side transitions must enforce the same
 * conditions atomically and must never trust a client-provided "sent" flag.
 */
export type TelegramInviteDraftState =
  | "pending"
  | "prepared"
  | "sent"
  | "published"
  | "cancelled";

export type TelegramInviteDraftTransition =
  | "prepare"
  | "confirm_send"
  | "publish"
  | "cancel";

export const nextTelegramInviteDraftState = (
  current: TelegramInviteDraftState,
  transition: TelegramInviteDraftTransition,
): TelegramInviteDraftState => {
  if (current === "pending" && transition === "prepare") return "prepared";
  if (current === "prepared" && transition === "confirm_send") return "sent";
  if (current === "sent" && transition === "publish") return "published";
  if ((current === "pending" || current === "prepared") && transition === "cancel") return "cancelled";
  throw new Error("telegram_invite_draft_transition_forbidden");
};

export const mayPublishTelegramInviteDraft = (
  state: TelegramInviteDraftState,
  expired: boolean,
  telegramShareConfirmed: boolean,
): boolean => state === "sent" && !expired && telegramShareConfirmed;
