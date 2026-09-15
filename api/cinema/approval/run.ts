import { createClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "../../_shared/env.js";
import { isReminderWorkerAuthorized } from "../../_shared/worker-authorization.js";
import { dispatchPendingCinemaPublicationApprovals } from "../../_shared/cinema-publication-approval.js";

const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

const pragueClock = (now = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  return {
    weekday: parts.find((part) => part.type === "weekday")?.value || "",
    hour: Number(parts.find((part) => part.type === "hour")?.value || "-1"),
  };
};

const isSundayEvening = (now = new Date()) => {
  const clock = pragueClock(now);
  return clock.weekday === "Sun" && clock.hour >= 17 && clock.hour <= 23;
};

export async function handleCinemaApprovalRun(request: Request) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  if (!isReminderWorkerAuthorized(request)) return json(401, { error: "unauthorized" });
  if (readEnv("CINEMA_PUBLICATION_APPROVAL_ENABLED") !== "true") {
    return json(503, { error: "cinema_publication_approval_disabled" });
  }

  let body: { force?: boolean; limit?: number };
  try {
    body = await request.json() as { force?: boolean; limit?: number };
  } catch {
    body = {};
  }

  if (body.force !== true && !isSundayEvening()) {
    return json(200, { ok: true, skipped: "outside_sunday_evening_window" });
  }

  try {
    const db = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const result = await dispatchPendingCinemaPublicationApprovals(db, {
      limit: Number.isInteger(body.limit) ? body.limit : 5,
    });
    return json(200, { ok: true, ...result });
  } catch (error) {
    console.error("kino007a_approval_dispatch_failed", {
      code: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return json(500, { error: "cinema_publication_approval_dispatch_failed" });
  }
}

export default handleCinemaApprovalRun;
