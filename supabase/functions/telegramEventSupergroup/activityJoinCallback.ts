import { sendCommunicationVerificationRequests } from "./communicationVerification.ts";
import * as base from "./activityJoinCallbackBase.ts";

export const parseActivityJoinCallback = base.parseActivityJoinCallback;

export const handleActivityJoinCallback = async (
  args: Parameters<typeof base.handleActivityJoinCallback>[0],
) => {
  const rawLanguage = (args.callbackQuery.from?.language_code || "").toLowerCase();
  const languageCode = ["ru", "uk", "cs", "en"].find((item) => rawLanguage.startsWith(item)) || "en";
  const callbackQuery = args.callbackQuery.from
    ? {
        ...args.callbackQuery,
        from: { ...args.callbackQuery.from, language_code: languageCode },
      }
    : args.callbackQuery;
  const result = await base.handleActivityJoinCallback({ ...args, callbackQuery });

  if (result.handled && result.status === "joined" && result.userKey) {
    try {
      await sendCommunicationVerificationRequests({
        supabase: args.supabase,
        telegramApi: args.telegramApi,
        userKeys: [result.userKey],
      });
    } catch {
      // Membership is durable and must never be rolled back by notification setup.
    }
  }

  return result;
};
