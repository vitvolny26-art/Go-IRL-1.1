import { handleActivityJoinCallback } from "./activityJoinCallback.ts";
import * as base from "./postEventCallbackBase.ts";
import {
  handleParticipantPostEventSurveyCallback,
  parseParticipantPostEventSurveyCallback,
} from "./postEventParticipantSurvey.ts";

export type { ParsedPostEventCallback } from "./postEventCallbackBase.ts";
export const parsePostEventCallback = (value: string | undefined) =>
  parseParticipantPostEventSurveyCallback(value) || base.parsePostEventCallback(value);

export const handlePostEventCallback = async (
  args: Parameters<typeof base.handlePostEventCallback>[0],
) => {
  const joinResult = await handleActivityJoinCallback(
    args as unknown as Parameters<typeof handleActivityJoinCallback>[0],
  );
  if (joinResult.handled) return joinResult;

  const participantSurveyResult = await handleParticipantPostEventSurveyCallback(
    args as unknown as Parameters<typeof handleParticipantPostEventSurveyCallback>[0],
  );
  if (participantSurveyResult.handled) return participantSurveyResult;

  return base.handlePostEventCallback(args);
};
