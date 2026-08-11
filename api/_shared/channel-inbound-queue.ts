import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./env.js";
import type { NormalizedInboundEvent } from "./provider-inbound-normalizer.js";

export type ChannelInboundEnqueueResult = "queued" | "duplicate";

const getAdminClient = () => createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export async function enqueueChannelInboundEvent(
  event: NormalizedInboundEvent,
): Promise<ChannelInboundEnqueueResult> {
  const client = getAdminClient();
  const { data, error } = await client.rpc("go_irl_enqueue_channel_inbound_event", {
    p_event_id: event.event_id,
    p_provider: event.provider,
    p_channel: event.channel,
    p_account_id: event.account_id,
    p_sender_id: event.sender_id,
    p_conversation_id: event.conversation_id,
    p_event_type: event.event_type,
    p_provider_timestamp: event.provider_timestamp,
    p_received_at: event.received_at,
    p_payload: event.payload,
  });
  if (error) throw error;
  if (data !== "queued" && data !== "duplicate") {
    throw new Error("channel_inbound_enqueue_unexpected_result");
  }
  return data;
}
