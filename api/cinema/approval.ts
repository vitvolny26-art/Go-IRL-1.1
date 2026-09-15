import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { readEnv, requireEnv } from "../_shared/env.js";
import { isReminderWorkerAuthorized } from "../_shared/worker-authorization.js";
import { dispatchPendingCinemaPublicationApprovals } from "../_shared/cinema-publication-approval.js";

const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

const page = (status: number, title: string, message: string) => new Response(
  `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><main style="font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 20px"><h1>${title}</h1><p>${message}</p></main></body></html>`,
  {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  },
);

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const parseRequestUrl = (request: Request) => new URL(request.url, "https://goirl.invalid");

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

type ClaimRow = {
  approval_id: string;
  parse_run_id: string;
  decision_state: string;
  claimed: boolean;
};

async function handleRun(request: Request) {
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

async function handleDecision(request: Request) {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { Allow: "GET" } });
  }

  const url = parseRequestUrl(request);
  const token = url.searchParams.get("token") || "";
  const decision = url.searchParams.get("decision") || "";
  if (!/^[0-9a-f]{64}$/i.test(token) || !["approve", "reject"].includes(decision)) {
    return page(400, "Некорректная ссылка", "Эта ссылка подтверждения недействительна.");
  }

  const db = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await db.rpc("cinema_claim_publication_decision", {
    p_token_hash: sha256(token.toLowerCase()),
    p_decision: decision,
  });
  if (error) {
    console.error("kino007a_decision_claim_failed", { code: error.code || "unknown" });
    return page(400, "Ссылка недействительна", "Решение не было применено.");
  }

  const row = (Array.isArray(data) ? data[0] : data) as ClaimRow | null;
  if (!row) return page(400, "Ссылка недействительна", "Решение не было найдено.");

  if (!row.claimed) {
    if (row.decision_state === "applied") {
      return page(200, "Уже опубликовано", "Этот кино-batch уже опубликован в Сити Афиша → Кино.");
    }
    if (row.decision_state === "applying") {
      return page(200, "Публикация уже запущена", "Повторное нажатие не создаст вторую публикацию.");
    }
    if (row.decision_state === "rejected") {
      return page(200, "Не публикуем", "Этот кино-batch уже был отклонён.");
    }
    if (row.decision_state === "expired" || row.decision_state === "superseded") {
      return page(410, "Ссылка устарела", "Используйте последнее сообщение от GO IRL.");
    }
    return page(409, "Решение уже обработано", `Текущее состояние: ${row.decision_state}.`);
  }

  if (decision === "reject") {
    return page(200, "Не публикуем", "Кино-batch оставлен вне Сити Афиша → Кино.");
  }

  const { data: syncRunId, error: applyError } = await db.rpc("cinema_apply_parse_run", {
    p_parse_run_id: row.parse_run_id,
  });

  if (applyError || !syncRunId) {
    const message = applyError?.message || "cinema_apply_parse_run_failed";
    await db.rpc("cinema_finish_publication_approval", {
      p_approval_id: row.approval_id,
      p_success: false,
      p_sync_run_id: null,
      p_error_message: message.slice(0, 500),
    });
    console.error("kino007a_apply_failed", { code: applyError?.code || "no_sync_run_id" });
    return page(409, "Публикация не выполнена", "Batch не применён. Никакая Activity не создавалась.");
  }

  const finish = await db.rpc("cinema_finish_publication_approval", {
    p_approval_id: row.approval_id,
    p_success: true,
    p_sync_run_id: syncRunId,
    p_error_message: null,
  });
  if (finish.error) {
    console.error("kino007a_finish_failed", { code: finish.error.code || "unknown" });
    return page(500, "Проверка статуса нужна", "Cinema sync выполнен, но ledger подтверждения не обновился.");
  }

  return page(200, "Опубликовано", "Cinema screenings применены и теперь доступны в Сити Афиша → Кино.");
}

export async function handleCinemaApproval(request: Request) {
  const url = parseRequestUrl(request);
  const mode = url.searchParams.get("mode");
  if (mode === "run") return handleRun(request);
  if (mode === "decision") return handleDecision(request);
  return json(404, { error: "cinema_publication_approval_route_not_found" });
}

export default {
  fetch(request: Request) {
    return handleCinemaApproval(request);
  },
};
