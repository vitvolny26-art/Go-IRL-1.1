import {
  browserMockUserKey,
  getCurrentAuthSession,
  initializeTrustedAuth,
  isBrowserMockMode,
  isTrustedAuthReady,
  readAuthUserKey,
} from "./authSession";
import {
  buildCoachRequestRetryPatch,
  normalizeCoachRequestDetails,
  type CoachRequestDetails,
} from "./coachRequestState";
import { attachDemoCoachProfile, demoCoachProfile } from "./demoCoachProfile";
import { supabase } from "./supabase";
import type { Activity, CoachRequest, CoachRequestType } from "./types";

const demoCoachStorageKey = "go-irl-demo-coach-requests-v1";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isServerActivityId = (activityId: string) => uuidPattern.test(activityId);

const isCoachDemoMode = () =>
  typeof window !== "undefined" &&
  (isBrowserMockMode() || (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && !isTrustedAuthReady()));

const readDemoCoachRequests = () => {
  try {
    const requests = JSON.parse(localStorage.getItem(demoCoachStorageKey) || "[]") as CoachRequest[];
    return requests.map(attachDemoCoachProfile);
  } catch {
    return [] as CoachRequest[];
  }
};

const writeDemoCoachRequests = (requests: CoachRequest[]) => {
  localStorage.setItem(demoCoachStorageKey, JSON.stringify(requests));
};

const isConfirmedOrganizerCoachRequest = (request: CoachRequest) =>
  request.requestType === "organizer_request" && request.status === "confirmed";

export async function getCurrentCoachUserKey() {
  if (isCoachDemoMode()) return browserMockUserKey;

  const existing = getCurrentAuthSession();
  const existingKey = readAuthUserKey(existing);
  if (existingKey) return existingKey;

  const identity = await initializeTrustedAuth();
  return readAuthUserKey(identity);
}

export async function loadCoachRequestsForActivity(activityId: string) {
  if (isCoachDemoMode() || !isServerActivityId(activityId)) {
    return readDemoCoachRequests().filter((request) => request.activityId === activityId);
  }

  if (!isTrustedAuthReady()) {
    return [];
  }

  const { data, error } = await supabase
    .from("coach_requests")
    .select("*")
    .eq("activity_id", activityId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data || []).map((row) => ({
    id: row.id,
    activityId: row.activity_id,
    requesterUserKey: row.requester_user_key,
    coachProfileId: row.coach_profile_id,
    requestType: row.request_type,
    sportType: row.sport_type,
    goal: row.goal,
    level: row.level,
    budgetMin: row.budget_min,
    budgetMax: row.budget_max,
    paymentMode: row.payment_mode,
    status: row.status,
    adminNote: row.admin_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  })) as CoachRequest[];
}

export function getDemoCoachProfile(profileId?: string) {
  return profileId === demoCoachProfile.id ? demoCoachProfile : null;
}

export async function hasConfirmedCoachForActivity(activityId: string) {
  const requests = await loadCoachRequestsForActivity(activityId);
  return requests.some(isConfirmedOrganizerCoachRequest);
}

export async function getOrganizerRoleRequestState(activityId: string) {
  const requests = await loadCoachRequestsForActivity(activityId);
  const request = requests.find((item) =>
    item.requestType === "organizer_request" &&
    !["cancelled", "completed", "rejected"].includes(item.status),
  );

  if (request?.status === "confirmed") return "confirmed" as const;
  if (request) return "requested" as const;
  return "none" as const;
}

export async function requestCoachForActivity(
  activity: Activity,
  requestType: CoachRequestType,
  requestDetails?: CoachRequestDetails,
) {
  const userKey = await getCurrentCoachUserKey();
  const details = normalizeCoachRequestDetails(requestDetails);

  if (!userKey) {
    throw new Error("auth_required");
  }

  if (isCoachDemoMode() || !isServerActivityId(activity.id)) {
    const requests = readDemoCoachRequests();
    const now = new Date().toISOString();
    const id = `demo-coach-${activity.id}-${userKey}-${requestType}`;
    const next: CoachRequest = {
      id,
      activityId: activity.id,
      requesterUserKey: userKey,
      coachProfileId: requestType === "organizer_request" ? demoCoachProfile.id : undefined,
      requestType,
      sportType: activity.categoryId || "sport",
      goal: details.goal,
      level: details.level,
      paymentMode: "split",
      status: requestType === "organizer_request" ? "confirmed" : "pending",
      createdAt: requests.find((request) => request.id === id)?.createdAt || now,
      updatedAt: now,
    };

    writeDemoCoachRequests([
      next,
      ...requests.filter((request) => request.id !== id),
    ]);
    return;
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("coach_requests")
    .upsert({
      activity_id: activity.id,
      requester_user_key: userKey,
      request_type: requestType,
      sport_type: activity.categoryId || "sport",
      goal: details.goal || null,
      level: details.level || null,
      payment_mode: "split",
      ...buildCoachRequestRetryPatch(now),
    }, {
      onConflict: "activity_id,requester_user_key,request_type",
      ignoreDuplicates: false,
    });

  if (error) throw error;
}

export async function cancelCoachRequest(requestId: string) {
  if (isCoachDemoMode() || requestId.startsWith("demo-coach-")) {
    const requests = readDemoCoachRequests();
    writeDemoCoachRequests(requests.map((request) =>
      request.id === requestId ? { ...request, status: "cancelled", updatedAt: new Date().toISOString() } : request,
    ));
    return;
  }

  const { error } = await supabase
    .from("coach_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", requestId);

  if (error) throw error;
}
