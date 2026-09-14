import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "../../_shared/env.js";

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

type ClaimRow = {
  approval_id: string;
  parse_run_id: string;
  decision_state: string;
  claimed: boolean;
};

export async function handleCinemaApprovalDecision(request: Request) {
  if (request.method !== "GET") {
    return new Response(null, { status: 405, headers: { Allow: "GET" } });
  }

  const url = new URL(request.url);
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

export default handleCinemaApprovalDecision;
