import { getTrustedAccessToken } from "./authSession";
import { sharePreparedTelegramInvite } from "./telegram";

import { supabase, getUserKey } from "./supabase";
import type { NewActivity } from "./types";

export const createHiddenActivityInviteDraft = async (
  activity: NewActivity,
  organizer: string,
): Promise<string> => {
  if (activity.visibility !== "invite") throw new Error("activity_invite_draft_visibility_required");
  const organizerKey = getUserKey();
  if (!organizerKey) throw new Error("trusted_auth_required");
  const { data, error } = await supabase.from("activity_invite_drafts")
    .insert({
      organizer_key: organizerKey,
      activity_payload: { ...activity, organizer },
      state: "pending",
    })
    .select("id")
    .single();
  if (error) throw error;
  if (!data?.id || !draftIdPattern.test(String(data.id))) {
    throw new Error("activity_invite_draft_creation_unconfirmed");
  }
  return String(data.id);
};

export type PreparedActivityInvite = {
  draftId: string;
  preparedMessageId: string;
};

const draftIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const trustedDraftRequest = async (action: string, draftId: string) => {
  if (!draftIdPattern.test(draftId)) throw new Error("invalid_activity_invite_draft_id");
  const endpoint = import.meta.env.VITE_SUPABASE_URL;
  const accessToken = await getTrustedAccessToken();
  if (!endpoint || !accessToken) throw new Error("trusted_auth_required");
  const response = await fetch(`${endpoint}/functions/v1/telegramEventSupergroup`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, draftId }),
  });
  if (!response.ok) {
    if (response.status === 409) {
      const body = await response.json().catch(() => null) as { error?: unknown } | null;
      if (body?.error === "delivery_unconfirmed") throw new Error("activity_invite_delivery_pending");
    }
    throw new Error("activity_invite_draft_service_unavailable");
  }
  return response.json() as Promise<Record<string, unknown>>;
};

export const prepareActivityInvite = async (draftId: string): Promise<PreparedActivityInvite> => {
  const result = await trustedDraftRequest("prepare_activity_invite", draftId);
  const preparedMessageId = result.preparedMessageId;
  if (typeof preparedMessageId !== "string" || !preparedMessageId.trim()) {
    throw new Error("activity_invite_preparation_unconfirmed");
  }
  return { draftId, preparedMessageId };
};

export const deliverPreparedActivityInvite = async (
  invite: PreparedActivityInvite,
): Promise<{ sent: boolean; publishedActivityId: string | null }> => {
  if (!draftIdPattern.test(invite.draftId) || !invite.preparedMessageId.trim()) {
    throw new Error("invalid_prepared_activity_invite");
  }
  const sent = await sharePreparedTelegramInvite(invite.preparedMessageId);
  if (!sent) return { sent: false, publishedActivityId: null };
  // The server must verify draft ownership, prepared message, and an
  // independently verifiable Telegram delivery receipt before publishing.
  // This client request is NOT proof of delivery by itself.
  // Telegram delivery evidence arrives independently through the webhook.
  // The native share callback is not evidence and can precede the webhook.
  const maxAttempts = 8;
  let result: Record<string, unknown> | null = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      result = await trustedDraftRequest("confirm_prepared_activity_invite", invite.draftId);
      break;
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "activity_invite_delivery_pending" || attempt === maxAttempts - 1) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(2000, 350 * (attempt + 1))));
    }
  }
  const activityId = result?.activityId;
  if (typeof activityId !== "string" || !draftIdPattern.test(activityId)) {
    throw new Error("activity_invite_publication_unconfirmed");
  }
  return { sent: true, publishedActivityId: activityId };
};
