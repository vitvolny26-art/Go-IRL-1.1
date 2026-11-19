import { isTrustedAuthReady } from "./authSession";
import { supabase } from "./supabase";

const coachInvitePattern = /^[0-9a-f]{64}$/;
export const coachInvitationStorageKey = "go-irl-coach-invitation-v1";

export const normalizeCoachInvitationCode = (value: string): string | null => {
  const code = value.replace(/^#/, "").trim().toLowerCase();
  return coachInvitePattern.test(code) ? code : null;
};

export const buildCoachInvitationUrl = (code: string, origin: string): string => {
  const token = normalizeCoachInvitationCode(code);
  if (!token) throw new Error("invalid_coach_invitation_code");
  return new URL("/coach-invite", origin).toString() + "#" + token;
};

export const rememberCoachInvitationCode = (code: string, storage: Storage): void => {
  const token = normalizeCoachInvitationCode(code);
  if (!token) return;
  storage.setItem(coachInvitationStorageKey, JSON.stringify({ code: token, savedAt: Date.now() }));
};

export const readRememberedCoachInvitationCode = (storage: Storage, now = Date.now()): string | null => {
  try {
    const value = JSON.parse(storage.getItem(coachInvitationStorageKey) || "null") as {
      code?: string; savedAt?: number;
    } | null;
    if (typeof value?.savedAt !== "number" || now - value.savedAt > 48 * 60 * 60 * 1000 || now < value.savedAt) {
      return null;
    }
    return normalizeCoachInvitationCode(value.code || "");
  } catch { return null; }
};

export type CoachInvitationPreview = {
  title: string;
  date: string;
  time: string;
  cityId: string;
  sportType: string;
  participantCount: number;
  address?: string | null;
  canOffer: boolean;
  offerStatus: "none" | "pending" | "accepted" | "declined" | "withdrawn";
};

const ensureTrustedSession = () => {
  if (!isTrustedAuthReady()) throw new Error("trusted_auth_required");
};

export const createCoachInvitation = async (activityId: string): Promise<string> => {
  ensureTrustedSession();
  const { data, error } = await supabase.rpc("go_irl_create_coach_invitation", { p_activity_id: activityId });
  if (error) throw error;
  const token = normalizeCoachInvitationCode(String(data || ""));
  if (!token) throw new Error("invalid_coach_invitation_response");
  return token;
};

export const revokeCoachInvitation = async (activityId: string): Promise<void> => {
  ensureTrustedSession();
  const { error } = await supabase.rpc("go_irl_revoke_coach_invitation", { p_activity_id: activityId });
  if (error) throw error;
};

export const previewCoachInvitation = async (code: string): Promise<CoachInvitationPreview> => {
  ensureTrustedSession();
  const token = normalizeCoachInvitationCode(code);
  if (!token) throw new Error("invalid_coach_invitation_code");
  const { data, error } = await supabase.rpc("go_irl_preview_coach_invitation", { p_token: token });
  if (error) throw error;
  if (!data || typeof data !== "object" || typeof data.title !== "string") {
    throw new Error("invalid_coach_invitation_preview");
  }
  return data as CoachInvitationPreview;
};

export const submitInvitedCoachOffer = async (code: string, displayName: string): Promise<void> => {
  ensureTrustedSession();
  const token = normalizeCoachInvitationCode(code);
  if (!token) throw new Error("invalid_coach_invitation_code");
  const { error } = await supabase.rpc("go_irl_submit_invited_coach_offer", {
    p_token: token,
    p_display_name: displayName.trim(),
  });
  if (error) throw error;
};
