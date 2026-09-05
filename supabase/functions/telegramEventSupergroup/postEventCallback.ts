import { handleActivityJoinCallback } from "./activityJoinCallback.ts";
import * as base from "./postEventCallbackBase.ts";

export type { ParsedPostEventCallback } from "./postEventCallbackBase.ts";
export const parsePostEventCallback = base.parsePostEventCallback;

export const handlePostEventCallback = async (
  args: Parameters<typeof base.handlePostEventCallback>[0],
) => {
  const joinResult = await handleActivityJoinCallback(
    args as unknown as Parameters<typeof handleActivityJoinCallback>[0],
  );
  if (joinResult.handled) return joinResult;
  return base.handlePostEventCallback(args);
};
