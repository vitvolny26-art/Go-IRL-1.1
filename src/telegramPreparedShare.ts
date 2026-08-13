import { getTelegramInitData, getTelegramWebApp } from "./telegram";
import type { Activity, Language } from "./types";
import { isValidInvitationEventId } from "./invitationLink";

export type PreparedTelegramShareResult =
  | "shared"
  | "cancelled"
  | "unavailable";

export const preparedTelegramShareEndpoint = "https://go-irl-1-1.vercel.app/api/telegram/prepared-event-share";

export const canSharePreparedTelegramMessage = () => {
  const webApp = getTelegramWebApp();
  return Boolean(webApp?.shareMessage && getTelegramInitData());
};

export async function sharePreparedTelegramEvent(
  activity: Activity,
  language: Language,
): Promise<PreparedTelegramShareResult> {
  const webApp = getTelegramWebApp();
  const initData = getTelegramInitData();

  if (
    !webApp?.shareMessage
    || !initData
    || !isValidInvitationEventId(activity.id)
  ) {
    return "unavailable";
  }

  try {
    const response = await fetch(preparedTelegramShareEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        initData,
        eventId: activity.id,
        language,
      }),
    });

    if (!response.ok) return "unavailable";

    const payload = await response.json() as {
      preparedMessageId?: unknown;
    };

    const preparedMessageId = payload.preparedMessageId;
    if (typeof preparedMessageId !== "string" || !preparedMessageId) {
      return "unavailable";
    }

    return await new Promise<PreparedTelegramShareResult>((resolve) => {
      let settled = false;

      const finish = (result: PreparedTelegramShareResult) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(result);
      };

      const timeout = window.setTimeout(
        () => finish("unavailable"),
        20_000,
      );

      webApp.shareMessage?.(
        preparedMessageId,
        (success) => finish(success ? "shared" : "cancelled"),
      );
    });
  } catch {
    return "unavailable";
  }
}
