import { getTrustedAccessToken } from "./authSession";
import { sharePreparedTelegramInvite } from "./telegram";

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
  if (!response.ok) throw new Error("activity_invite_draft_service_unavailable");
  return response.json() as Promise<Record<string, unknown>>;
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
  const result = await trustedDraftRequest("confirm_prepared_activity_invite", invite.draftId);
  const activityId = result.activityId;
  if (typeof activityId !== "string" || !draftIdPattern.test(activityId)) {
    throw new Error("activity_invite_publication_unconfirmed");
  }
  return { sent: true, publishedActivityId: activityId };
};
