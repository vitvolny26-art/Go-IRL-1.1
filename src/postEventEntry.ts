import { isValidInvitationEventId } from "./invitationLink.js";

export type PostEventEntryIntent = {
  activityId: string;
  feedbackId?: string;
};

type PostEventEntryLocation = {
  pathname: string;
  search?: string;
  hash?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidPostEventFeedbackId = (value: string) => uuidPattern.test(value.trim());

export const buildPostEventActivityPath = (activityId: string, feedbackId?: string) => {
  const params = new URLSearchParams();
  params.set("post_event_activity", activityId.trim());
  if (feedbackId) params.set("post_event_feedback", feedbackId.trim());
  return `/activities?${params.toString()}#post_event`;
};

export const resolvePostEventEntryIntent = ({
  pathname,
  search = "",
  hash = "",
}: PostEventEntryLocation): PostEventEntryIntent | null => {
  if (hash.replace(/^#/, "").trim().toLowerCase().replaceAll("-", "_") !== "post_event") return null;
  if (pathname.replace(/\/+$/, "") !== "/activities") return null;

  const params = new URLSearchParams(search);
  const activityId = String(params.get("post_event_activity") || "").trim();
  if (!isValidInvitationEventId(activityId)) return null;

  const rawFeedbackId = String(params.get("post_event_feedback") || "").trim();
  if (rawFeedbackId && !isValidPostEventFeedbackId(rawFeedbackId)) return null;

  return {
    activityId,
    ...(rawFeedbackId ? { feedbackId: rawFeedbackId } : {}),
  };
};
