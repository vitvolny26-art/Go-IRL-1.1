import { getCurrentCoachUserKey } from "./coachFeature";
import { isTrustedAuthReady } from "./authSession";
import { supabase } from "./supabase";

export type CoachOfferStatus = "pending" | "accepted" | "declined" | "withdrawn";
export type CoachOffer = {
  id: string;
  candidateUserKey: string;
  coachProfileId: string;
  displayName: string;
  status: CoachOfferStatus;
};
export type CoachPublicState = "none" | "requested" | "confirmed";

// Cross-account assignment requires trusted authentication; never use browser demo state.
const requireTrustedActor = async () => {
  if (!isTrustedAuthReady()) throw new Error("trusted_auth_required");
  const actor = await getCurrentCoachUserKey();
  if (!actor) throw new Error("trusted_auth_required");
  return actor;
};

export const getPublicCoachState = async (activityId: string): Promise<CoachPublicState> => {
  if (!isTrustedAuthReady()) return "none";
  const { data, error } = await supabase.rpc("go_irl_public_coach_state", { p_activity_id: activityId });
  if (error) throw error;
  return data === "confirmed" || data === "requested" ? data : "none";
};

export const loadCoachOffers = async (activityId: string): Promise<CoachOffer[]> => {
  await requireTrustedActor();
  const { data, error } = await supabase
    .from("coach_event_offers")
    .select("id,candidate_user_key,coach_profile_id,status,coach_profiles(display_name)")
    .eq("activity_id", activityId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((row: {
    id: string; candidate_user_key: string; coach_profile_id: string; status: string;
    coach_profiles?: { display_name?: string } | { display_name?: string }[] | null;
  }) => {
    const profile = Array.isArray(row.coach_profiles) ? row.coach_profiles[0] : row.coach_profiles;
    return {
      id: String(row.id),
      candidateUserKey: String(row.candidate_user_key),
      coachProfileId: String(row.coach_profile_id),
      displayName: typeof profile?.display_name === "string" ? profile.display_name : "Тренер",
      status: row.status as CoachOfferStatus,
    };
  });
};

export const canOfferAsCoach = async (activityId: string): Promise<boolean> => {
  await requireTrustedActor();
  const { data, error } = await supabase.rpc("go_irl_can_offer_coach", { p_activity_id: activityId });
  if (error) throw error;
  return data === true;
};

export const offerAsCoach = async (activityId: string, displayName: string): Promise<void> => {
  await requireTrustedActor();
  const { error } = await supabase.rpc("go_irl_submit_coach_offer", {
    p_activity_id: activityId,
    p_display_name: displayName.trim(),
  });
  if (error) throw error;
};

export const acceptCoachOffer = async (offerId: string): Promise<void> => {
  await requireTrustedActor();
  const { error } = await supabase.rpc("go_irl_accept_coach_offer", { p_offer_id: offerId });
  if (error) throw error;
};

export const closeCoachOffer = async (offerId: string, status: "withdrawn" | "declined"): Promise<void> => {
  await requireTrustedActor();
  const { error } = await supabase.rpc("go_irl_close_coach_offer", {
    p_offer_id: offerId,
    p_status: status,
  });
  if (error) throw error;
};
