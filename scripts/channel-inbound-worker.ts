import { readEnv, requireEnv } from "../api/_shared/env.js";
import { runChannelInboundWorkerBatch } from "../api/_shared/channel-inbound-worker.js";

const boundedInteger = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`invalid_environment:${name}`);
  }
  return value;
};

const workerErrorCode = (error: unknown) => {
  if (!(error instanceof Error)) return "unknown_error";
  const known = /^(channel_inbound_[A-Za-z0-9_-]+(?::[A-Za-z0-9_-]+)?|missing_environment:[A-Z0-9_]+|invalid_environment:[A-Z0-9_]+)$/.exec(error.message)?.[1];
  return known || error.name.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60) || "unknown_error";
};

const validatePublicOrigin = () => {
  const value = requireEnv("GO_IRL_PUBLIC_ORIGIN");
  const origin = new URL(value);
  if (origin.protocol !== "https:" || origin.origin !== value.replace(/\/$/, "")) {
    throw new Error("invalid_environment:GO_IRL_PUBLIC_ORIGIN");
  }
  return origin.origin;
};

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  if (readEnv("GO_IRL_CHANNEL_INBOUND_WORKER_ENABLED") !== "true") {
    throw new Error("channel_inbound_worker_disabled");
  }
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  validatePublicOrigin();

  const once = process.argv.includes("--once");
  const limit = boundedInteger("GO_IRL_CHANNEL_INBOUND_WORKER_BATCH_LIMIT", 50, 1, 200);
  const leaseSeconds = boundedInteger("GO_IRL_CHANNEL_INBOUND_WORKER_LEASE_SECONDS", 300, 30, 1800);
  const maxAttempts = boundedInteger("GO_IRL_CHANNEL_INBOUND_WORKER_MAX_ATTEMPTS", 5, 1, 20);
  const pollMs = boundedInteger("GO_IRL_CHANNEL_INBOUND_WORKER_POLL_MS", 1000, 250, 60_000);
  let stopping = false;
  let lastHeartbeatAt = 0;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  do {
    try {
      const summary = await runChannelInboundWorkerBatch({
        limit,
        leaseSeconds,
        maxAttempts,
      });
      const now = Date.now();
      if (summary.claimed > 0 || now - lastHeartbeatAt >= 60_000) {
        console.warn("channel_inbound_worker_health", {
          ok: true,
          ...summary,
          checkedAt: new Date(now).toISOString(),
        });
        lastHeartbeatAt = now;
      }
      if (once) return;
      if (summary.claimed === 0) await sleep(pollMs);
    } catch (error) {
      const code = workerErrorCode(error);
      console.error("channel_inbound_worker_failed", { code });
      if (once) throw error;
      await sleep(Math.max(pollMs, 5000));
    }
  } while (!stopping);

  console.warn("channel_inbound_worker_stopped", { graceful: true });
}

main().catch((error) => {
  console.error("channel_inbound_worker_exit", { code: workerErrorCode(error) });
  process.exitCode = 1;
});
