import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { enqueueChannelInboundEvent } from "../api/_shared/channel-inbound-queue.js";
import {
  buildChannelInboundSmokeEvent,
  isChannelInboundSmokeProcessed,
  validateChannelInboundSmokeFixtureId,
} from "../api/_shared/channel-inbound-smoke.js";
import { requireEnv } from "../api/_shared/env.js";

const fixtureArgument = () => {
  const raw = process.argv.find((value) => value.startsWith("--fixture-id="))?.slice("--fixture-id=".length) || "";
  return validateChannelInboundSmokeFixtureId(raw);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const fixtureId = fixtureArgument();
  const event = buildChannelInboundSmokeEvent(fixtureId);
  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const first = await enqueueChannelInboundEvent(event);
  if (first !== "queued") throw new Error(`smoke_initial_enqueue_${first}`);
  console.warn("channel_inbound_smoke_enqueued", { fixtureId, result: first });

  const deadline = Date.now() + 30_000;
  let row: { processing_status: string; attempt_count: number; last_error_code: string | null } | null = null;
  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("channel_inbound_events")
      .select("processing_status,attempt_count,last_error_code")
      .eq("provider", "meta")
      .eq("channel", "messenger")
      .eq("account_id", event.account_id)
      .eq("event_id", event.event_id)
      .maybeSingle();
    if (error) throw new Error(`smoke_status_read_failed:${error.code || "unknown"}`);
    row = data;
    if (row?.processing_status === "processed" || row?.processing_status === "dead_letter") break;
    await sleep(250);
  }

  if (!row || !isChannelInboundSmokeProcessed(row)) {
    throw new Error(`smoke_worker_not_processed:${row?.processing_status || "missing"}:${row?.last_error_code || "none"}`);
  }

  const replay = await enqueueChannelInboundEvent(event);
  if (replay !== "duplicate") throw new Error(`smoke_replay_${replay}`);

  console.warn("channel_inbound_smoke_passed", {
    fixtureId,
    initial: first,
    processingStatus: row.processing_status,
    attemptCount: row.attempt_count,
    replay,
  });
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    const code = error instanceof Error ? error.message : "unknown_error";
    console.error("channel_inbound_smoke_failed", { code });
    process.exitCode = 1;
  });
}
