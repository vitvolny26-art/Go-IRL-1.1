// @ts-expect-error Deno Edge requires .ts extensions; the Vite test tsconfig does not allow them.
import { matchesPreparedInviteDelivery, type TelegramChosenInlineResult } from "./activ020DeliveryEvidence.ts";

type Database = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase PostgREST fluent query mock shape.
  from: (table: string) => any;
};

const compactUuid = /^[0-9a-f]{32}$/i;
const expandUuid = (value: string) =>
  [value.slice(0, 8), value.slice(8, 12), value.slice(12, 16), value.slice(16, 20), value.slice(20)].join("-");

/**
 * Accepts only a Telegram-secret-authorized webhook update.
 * Caller MUST verify x-telegram-bot-api-secret-token before invoking.
 * Uses a conditional update so repeated webhook delivery is idempotent.
 */
export const handleActiv020ChosenInlineResult = async (
  db: Database,
  chosen: TelegramChosenInlineResult,
): Promise<{ handled: boolean; confirmed: boolean }> => {
  if (typeof chosen.result_id !== "string" || !compactUuid.test(chosen.result_id)) {
    return { handled: false, confirmed: false };
  }
  const draftId = expandUuid(chosen.result_id);
  const { data: draft, error } = await db.from("activity_invite_drafts")
    .select("id,organizer_key,state,prepared_message_id,expires_at")
    .eq("id", draftId).maybeSingle();
  if (error) throw error;
  if (!draft) return { handled: false, confirmed: false };
  if (draft.state === "sent" || draft.state === "published") return { handled: true, confirmed: true };
  if (draft.state !== "prepared" || !draft.prepared_message_id
    || new Date(draft.expires_at).getTime() <= Date.now()) {
    return { handled: true, confirmed: false };
  }
  const { data: identity, error: identityError } = await db.from("user_provider_identities")
    .select("provider_user_id")
    .eq("user_key", draft.organizer_key)
    .eq("provider", "telegram")
    .eq("status", "active")
    .not("consented_at", "is", null)
    .maybeSingle();
  if (identityError) throw identityError;
  const userId = Number(identity?.provider_user_id);
  if (!matchesPreparedInviteDelivery({ chosen_inline_result: chosen }, {
    resultId: chosen.result_id, telegramUserId: userId,
  })) return { handled: true, confirmed: false };
  const { data: updated, error: updateError } = await db.from("activity_invite_drafts")
    .update({ state: "sent", updated_at: new Date().toISOString() })
    .eq("id", draftId).eq("state", "prepared")
    .select("id").maybeSingle();
  if (updateError) throw updateError;
  return { handled: true, confirmed: Boolean(updated) };
};
