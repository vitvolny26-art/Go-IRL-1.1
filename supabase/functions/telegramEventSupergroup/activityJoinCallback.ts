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
  return base.handleActivityJoinCallback({ ...args, callbackQuery });
};
