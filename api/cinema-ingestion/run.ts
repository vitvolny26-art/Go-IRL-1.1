import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "../_shared/env.js";
import { createVercelHandler } from "../_shared/vercel-handler.js";
import { runCinemaIngestionWorkerBatch } from "../_shared/cinema-ingestion-worker.js";

const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

const authorized = (request: Request) => {
  const secret = readEnv("GO_IRL_CINEMA_CRON_SECRET") || readEnv("CRON_SECRET");
  if (!secret) return false;
  const actual = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
};

const serviceClient = () => createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function health() {
  const db = serviceClient();
  const [{ data: sources, error: sourceError }, { data: jobs, error: jobError }] = await Promise.all([
    db.from("cinema_ingestion_health_v").select("*").order("venue_name"),
    db.from("cinema_ingestion_jobs")
      .select("job_type,status,run_after,error_message")
      .in("status", ["queued", "running", "failed"])
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (sourceError) throw new Error(`cinema_health_sources_failed:${sourceError.code}`);
  if (jobError) throw new Error(`cinema_health_jobs_failed:${jobError.code}`);
  return {
    enabled: readEnv("GO_IRL_CINEMA_WORKER_ENABLED") === "true",
    sources: sources || [],
    jobs: jobs || [],
    checked_at: new Date().toISOString(),
  };
}

export async function handleCinemaIngestionRun(request: Request) {
  if (request.method !== "GET" && request.method !== "POST") {
    return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
  }
  if (!authorized(request)) return json(401, { error: "unauthorized" });

  if (request.method === "GET") {
    try { return json(200, await health()); }
    catch (error) {
      console.error("cinema_ingestion_health_failed", {
        code: error instanceof Error ? error.message.slice(0, 120) : "unknown",
      });
      return json(503, { error: "cinema_ingestion_health_failed" });
    }
  }

  if (readEnv("GO_IRL_CINEMA_WORKER_ENABLED") !== "true") {
    return json(503, { error: "cinema_worker_disabled" });
  }

  try {
    const db = serviceClient();
    const { data: enqueued, error: enqueueError } = await db.rpc("cinema_enqueue_due_sources", {
      p_now: new Date().toISOString(),
      p_limit: 100,
    });
    if (enqueueError) throw new Error(`cinema_enqueue_due_failed:${enqueueError.code}`);

    const batches = [];
    let totalClaimed = 0;
    let totalSucceeded = 0;
    let totalRetriedOrFailed = 0;
    for (let index = 0; index < 20; index += 1) {
      const batch = await runCinemaIngestionWorkerBatch({
        db,
        workerId: `vercel-cinema:${Date.now()}:${index}`,
        limit: 20,
      });
      batches.push(batch);
      totalClaimed += batch.claimed;
      totalSucceeded += batch.succeeded;
      totalRetriedOrFailed += batch.retriedOrFailed;
      if (batch.claimed === 0) break;
    }

    const result = {
      enqueued: Array.isArray(enqueued) ? enqueued.length : 0,
      claimed: totalClaimed,
      succeeded: totalSucceeded,
      retried_or_failed: totalRetriedOrFailed,
      batches: batches.length,
    };
    console.warn("cinema_ingestion_run_completed", result);
    return json(200, result);
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 160) : "unknown";
    console.error("cinema_ingestion_run_failed", { code });
    return json(503, { error: "cinema_ingestion_run_failed", code });
  }
}

export default createVercelHandler(handleCinemaIngestionRun);
