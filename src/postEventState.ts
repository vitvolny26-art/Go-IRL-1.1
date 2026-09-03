import { initializeTrustedAuth } from "./authSession";
import { supabase } from "./supabase";
import { buildPostEventActivityPath, isValidPostEventFeedbackId, type PostEventEntryIntent } from "./postEventEntry";
import { isValidInvitationEventId } from "./invitationLink";

export type OrganizerPostEventClaim = "happened" | "did_not_happen" | "problem";
export type ParticipantPostEventClaim = "attended" | "absent" | "event_did_not_happen";
export type AttendanceResolution = "pending" | "attended" | "absent" | "disputed" | "voided";

export type OrganizerPostEventRow = {
  activityId: string;
  eventResolution: string;
  organizerEventClaim: OrganizerPostEventClaim | null;
  organizerRespondedAt: string | null;
  organizerRosterFinalizedAt: string | null;
  participantFallbackAt: string;
  feedbackId: string;
  participantDisplayName: string;
  eligibilityState: string;
  organizerDraftAbsent: boolean;
  organizerClaim: "attended" | "absent" | null;
  participantClaim: ParticipantPostEventClaim | null;
  attendanceResolution: AttendanceResolution;
};

export type ParticipantPostEventState = {
  feedbackId: string;
  activityId: string;
  eventResolution: string;
  organizerEventClaim: OrganizerPostEventClaim | null;
  participantFallbackAt: string;
  eligibilityState: string;
  organizerClaim: "attended" | "absent" | null;
  participantClaim: ParticipantPostEventClaim | null;
  attendanceResolution: AttendanceResolution;
  organizerRating: number | null;
  ratingTags: string[];
  ratingFirstSubmittedAt: string | null;
  ratingUpdatedAt: string | null;
};

export type InAppPostEventIntent = PostEventEntryIntent & {
  key: string;
  notificationId: string;
  kind: "post_event.organizer_confirmation" | "post_event.participant_confirmation";
  createdAt: string;
  title?: string;
};

type RpcError = { code?: string; message?: string } | null;
type RpcResult = { data: unknown; error: RpcError };
export type PostEventRpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<RpcResult>;
};

type PostEventDependencies = {
  client?: PostEventRpcClient;
  initializeAuth?: () => Promise<{ source?: string } | null>;
};

type NotificationRow = {
  id?: unknown;
  activity_id?: unknown;
  kind?: unknown;
  payload?: unknown;
  created_at?: unknown;
};

const rowFrom = (data: unknown) => {
  const row = Array.isArray(data) ? data[0] : data;
  return row && typeof row === "object" ? row as Record<string, unknown> : undefined;
};

const rowsFrom = (data: unknown) => Array.isArray(data)
  ? data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
  : [];

const stringOrNull = (value: unknown) => typeof value === "string" && value ? value : null;
const booleanValue = (value: unknown) => value === true;

const requireTrustedAuth = async (dependencies: PostEventDependencies = {}) => {
  const identity = await (dependencies.initializeAuth || initializeTrustedAuth)();
  if (identity?.source !== "trusted-telegram" && identity?.source !== "trusted-provider") {
    throw new Error("post_event_trusted_auth_required");
  }
};

const rpc = async (name: string, args: Record<string, unknown>, dependencies: PostEventDependencies = {}) => {
  await requireTrustedAuth(dependencies);
  const result = await (dependencies.client || (supabase as unknown as PostEventRpcClient)).rpc(name, args);
  if (result.error) throw new Error(`post_event_rpc_failed:${name}:${result.error.code || "unknown"}`);
  return result.data;
};

export const normalizeOrganizerPostEventRows = (data: unknown): OrganizerPostEventRow[] => rowsFrom(data).map((row) => ({
  activityId: String(row.activity_id || ""),
  eventResolution: String(row.event_resolution || "pending"),
  organizerEventClaim: stringOrNull(row.organizer_event_claim) as OrganizerPostEventClaim | null,
  organizerRespondedAt: stringOrNull(row.organizer_responded_at),
  organizerRosterFinalizedAt: stringOrNull(row.organizer_roster_finalized_at),
  participantFallbackAt: String(row.participant_fallback_at || ""),
  feedbackId: String(row.feedback_id || ""),
  participantDisplayName: String(row.participant_display_name || "GO IRL User"),
  eligibilityState: String(row.eligibility_state || ""),
  organizerDraftAbsent: booleanValue(row.organizer_draft_absent),
  organizerClaim: stringOrNull(row.organizer_claim) as "attended" | "absent" | null,
  participantClaim: stringOrNull(row.participant_claim) as ParticipantPostEventClaim | null,
  attendanceResolution: String(row.attendance_resolution || "pending") as AttendanceResolution,
}));

export const normalizeParticipantPostEventState = (data: unknown): ParticipantPostEventState | null => {
  const row = rowFrom(data);
  if (!row) return null;
  return {
    feedbackId: String(row.feedback_id || ""),
    activityId: String(row.activity_id || ""),
    eventResolution: String(row.event_resolution || "pending"),
    organizerEventClaim: stringOrNull(row.organizer_event_claim) as OrganizerPostEventClaim | null,
    participantFallbackAt: String(row.participant_fallback_at || ""),
    eligibilityState: String(row.eligibility_state || ""),
    organizerClaim: stringOrNull(row.organizer_claim) as "attended" | "absent" | null,
    participantClaim: stringOrNull(row.participant_claim) as ParticipantPostEventClaim | null,
    attendanceResolution: String(row.attendance_resolution || "pending") as AttendanceResolution,
    organizerRating: typeof row.organizer_rating === "number" ? row.organizer_rating : null,
    ratingTags: Array.isArray(row.rating_tags) ? row.rating_tags.filter((tag): tag is string => typeof tag === "string") : [],
    ratingFirstSubmittedAt: stringOrNull(row.rating_first_submitted_at),
    ratingUpdatedAt: stringOrNull(row.rating_updated_at),
  };
};

export const loadOrganizerPostEventState = async (activityId: string, dependencies: PostEventDependencies = {}) =>
  normalizeOrganizerPostEventRows(await rpc(
    "go_irl_get_activity_post_event_organizer_state",
    { p_activity_id: activityId },
    dependencies,
  ));

export const loadParticipantPostEventState = async (feedbackId: string, dependencies: PostEventDependencies = {}) =>
  normalizeParticipantPostEventState(await rpc(
    "go_irl_get_activity_post_event_participant_state",
    { p_feedback_id: feedbackId },
    dependencies,
  ));

export const recordOrganizerPostEventOutcome = async (
  activityId: string,
  claim: OrganizerPostEventClaim,
  dependencies: PostEventDependencies = {},
) => rpc("go_irl_record_activity_post_event_outcome", { p_activity_id: activityId, p_claim: claim }, dependencies);

export const toggleOrganizerPostEventAbsence = async (
  feedbackId: string,
  absent: boolean,
  dependencies: PostEventDependencies = {},
) => rpc("go_irl_toggle_activity_post_event_absence", { p_feedback_id: feedbackId, p_absent: absent }, dependencies);

export const finalizeOrganizerPostEventAttendance = async (
  activityId: string,
  dependencies: PostEventDependencies = {},
) => rpc("go_irl_finalize_activity_post_event_attendance", { p_activity_id: activityId }, dependencies);

export const submitParticipantPostEventAttendance = async (
  feedbackId: string,
  claim: ParticipantPostEventClaim,
  dependencies: PostEventDependencies = {},
) => rpc("go_irl_submit_activity_attendance_confirmation", { p_feedback_id: feedbackId, p_claim: claim }, dependencies);

export const submitPostEventOrganizerRating = async (
  feedbackId: string,
  rating: number,
  tags: string[],
  dependencies: PostEventDependencies = {},
) => rpc("go_irl_submit_organizer_rating", {
  p_feedback_id: feedbackId,
  p_rating: rating,
  p_tags: tags,
}, dependencies);

export const organizerPostEventComplete = (rows: OrganizerPostEventRow[]) => {
  const outcome = rows[0];
  if (!outcome?.organizerEventClaim) return false;
  if (outcome.organizerEventClaim !== "happened") return true;
  return Boolean(outcome.organizerRosterFinalizedAt);
};

export const participantPostEventComplete = (state: ParticipantPostEventState | null) => {
  if (!state?.participantClaim) return false;
  if (state.attendanceResolution !== "attended") return true;
  return state.organizerRating !== null;
};

const localizedTitle = (payload: Record<string, unknown>) => {
  const candidate = payload.title || payload.activity;
  if (!candidate || typeof candidate !== "object") return undefined;
  const values = candidate as Record<string, unknown>;
  for (const key of ["ru", "uk", "cs", "en"]) {
    if (typeof values[key] === "string" && String(values[key]).trim()) return String(values[key]).trim();
  }
  return undefined;
};

export const postEventIntentFromNotificationRow = (row: NotificationRow): InAppPostEventIntent | null => {
  const kind = row.kind;
  if (kind !== "post_event.organizer_confirmation" && kind !== "post_event.participant_confirmation") return null;
  if (typeof row.id !== "string" || typeof row.created_at !== "string") return null;
  const payload = row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : {};
  const activityId = String(payload.eventId || row.activity_id || "").trim();
  if (!isValidInvitationEventId(activityId)) return null;

  const feedbackId = kind === "post_event.participant_confirmation" ? String(payload.feedbackId || "").trim() : "";
  if (kind === "post_event.participant_confirmation" && !isValidPostEventFeedbackId(feedbackId)) return null;

  return {
    activityId,
    ...(feedbackId ? { feedbackId } : {}),
    key: feedbackId ? `participant:${feedbackId}` : `organizer:${activityId}`,
    notificationId: row.id,
    kind,
    createdAt: row.created_at,
    title: localizedTitle(payload),
  };
};

export const loadInAppPostEventIntents = async (): Promise<InAppPostEventIntent[]> => {
  await requireTrustedAuth();
  const since = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("event_notifications")
    .select("id,activity_id,kind,payload,created_at")
    .in("kind", ["post_event.organizer_confirmation", "post_event.participant_confirmation"])
    .eq("status", "sent")
    .eq("routing_outcome", "in_app")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`post_event_in_app_read_failed:${error.code || "unknown"}`);

  const seen = new Set<string>();
  return ((data || []) as NotificationRow[])
    .map(postEventIntentFromNotificationRow)
    .filter((intent): intent is InAppPostEventIntent => Boolean(intent))
    .filter((intent) => {
      if (seen.has(intent.key)) return false;
      seen.add(intent.key);
      return true;
    });
};

export const isPostEventIntentActionable = async (intent: PostEventEntryIntent) => {
  if (intent.feedbackId) return !participantPostEventComplete(await loadParticipantPostEventState(intent.feedbackId));
  return !organizerPostEventComplete(await loadOrganizerPostEventState(intent.activityId));
};

export const postEventIntentHref = (intent: PostEventEntryIntent) => buildPostEventActivityPath(intent.activityId, intent.feedbackId);
