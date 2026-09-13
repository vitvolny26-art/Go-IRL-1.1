import "../api/_shared/cinema-adapters/register.js";
import { readEnv, requireEnv } from "../api/_shared/env.js";
import { runCinemaIngestionWorkerBatch } from "../api/_shared/cinema-ingestion-worker.js";

const boundedInteger = (name: string, fallback: number, minimum: number, maximum: number) => {
  const raw = readEnv(name);
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`invalid_environment:${name}`);
  }
  return value;
};

const errorCode = (error: unknown) => {
  if (!(error instanceof Error)) return "unknown_error";
  return error.message.replace(/[^A-Za-z0-9:_-]/g, "").slice(0, 120) || error.name;
};

const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function main() {
  if (readEnv("GO_IRL_CINEMA_WORKER_ENABLED") !== "true") {
    throw new Error("cinema_worker_disabled");
  }
  requireEnv("SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const once = process.argv.includes("--once");
  const batchLimit = boundedInteger("GO_IRL_CINEMA_WORKER_BATCH_LIMIT", 10, 1, 100);
  const pollMs = boundedInteger("GO_IRL_CINEMA_WORKER_POLL_MS", 5_000, 500, 60_000);
  const workerId = readEnv("GO_IRL_CINEMA_WORKER_ID") || `cinema-worker:${process.pid}`;
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);

  do {
    try {
      const summary = await runCinemaIngestionWorkerBatch({ workerId, limit: batchLimit });
      console.warn("cinema_worker_health", {
        ok: true,
        ...summary,
        checkedAt: new Date().toISOString(),
      });
      if (once) return;
      if (summary.claimed === 0) await sleep(pollMs);
    } catch (error) {
      console.error("cinema_worker_failed", { code: errorCode(error) });
      if (once) throw error;
      await sleep(Math.max(5_000, pollMs));
    }
  } while (!stopping);

  console.warn("cinema_worker_stopped", { graceful: true });
}

main().catch((error) => {
  console.error("cinema_worker_exit", { code: errorCode(error) });
  process.exitCode = 1;
});
