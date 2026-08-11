import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env.js";
import type { NormalizedInboundEvent } from "./provider-inbound-normalizer.js";

export type ChannelInboundEnqueueResult = "queued" | "duplicate";

export type ClaimedChannelInboundEvent = Omit<
  NormalizedInboundEvent,
  "processing_status" | "attempt_count"
> & {
  id: string;
  attempt_count: number;
};

export type ChannelInboundFinishOutcome =
  | { status: "processed" }
  | { status: "retry"; errorCode: string; retryAt: string }
  | { status: "failed"; errorCode: string }
  | { status: "dead_letter"; errorCode: string };

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

type ClaimedChannelInboundRow = {
  id: string;
  event_id: string;
  provider: "meta";
  channel: ClaimedChannelInboundEvent["channel"];
  account_id: string | null;
  sender_id: string;
  conversation_id: string;
  event_type: ClaimedChannelInboundEvent["event_type"];
  provider_timestamp: string | null;
  received_at: string;
  payload: Record<string, unknown>;
  attempt_count: number;
};

export class ChannelInboundQueueRepository {
  constructor(private readonly client: SupabaseClient = getAdminClient()) {}

  async claim(limit = 50, leaseSeconds = 300): Promise<ClaimedChannelInboundEvent[]> {
    const { data, error } = await this.client.rpc("go_irl_claim_channel_inbound_events", {
      p_limit: limit,
      p_lease_seconds: leaseSeconds,
    });
    if (error) {
      throw new Error(`channel_inbound_claim_failed:${error.code || "unknown"}`);
    }
    return ((data || []) as ClaimedChannelInboundRow[]).map((row) => ({
      id: row.id,
      event_id: row.event_id,
      provider: row.provider,
      channel: row.channel,
      account_id: row.account_id,
      sender_id: row.sender_id,
      conversation_id: row.conversation_id,
      event_type: row.event_type,
      provider_timestamp: row.provider_timestamp,
      received_at: row.received_at,
      payload: row.payload,
      attempt_count: row.attempt_count,
    }));
  }

  async finish(id: string, outcome: ChannelInboundFinishOutcome) {
    const { error } = await this.client.rpc("go_irl_finish_channel_inbound_event", {
      p_channel_inbound_event_id: id,
      p_outcome: outcome.status,
      p_error_code: outcome.status === "processed" ? null : outcome.errorCode,
      p_retry_at: outcome.status === "retry" ? outcome.retryAt : null,
    });
    if (error) {
      throw new Error(`channel_inbound_finish_failed:${error.code || "unknown"}`);
    }
  }
}
