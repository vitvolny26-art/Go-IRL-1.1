import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = JSON.parse(
  readFileSync(
    new URL("../n8n/workflows/kino000c-daily-cinema-monitor.json", import.meta.url),
    "utf8",
  ),
) as {
  active: boolean;
  description: string;
  settings?: { timezone?: string; executionOrder?: string };
  nodes: Array<{
    name: string;
    type: string;
    disabled?: boolean;
    parameters?: Record<string, unknown>;
    credentials?: Record<string, unknown>;
  }>;
  connections?: Record<string, { main?: Array<Array<{ node: string }>> }>;
};

const node = (name: string) => workflow.nodes.find((entry) => entry.name === name);

describe("Kino000C daily cinema scheduler repository contract", () => {
  it("is an inactive repository candidate pinned to 06:00 Europe/Prague", () => {
    expect(workflow.active).toBe(false);
    expect(workflow.settings?.timezone).toBe("Europe/Prague");
    expect(workflow.settings?.executionOrder).toBe("v1");

    const schedule = node("Daily Schedule");
    expect(schedule?.type).toBe("n8n-nodes-base.scheduleTrigger");
    expect(schedule?.disabled).not.toBe(true);
    expect(schedule?.parameters).toEqual(expect.objectContaining({
      rule: {
        interval: [
          {
            field: "cronExpression",
            expression: "0 6 * * *",
          },
        ],
      },
    }));
  });

  it("dispatches only registry-driven daily enqueue through the governed worker release", () => {
    const dispatch = node("Dispatch Through Cinema Worker");
    expect(dispatch?.type).toBe("n8n-nodes-base.ssh");
    const command = String(dispatch?.parameters?.command ?? "");

    expect(command).toContain(
      "sudo -n /usr/local/sbin/go-irl-cinema-workerctl enqueue-connected-daily",
    );
    expect(command).toContain("5999f333d41201171f42592f0c91253dc2ebd663");
    expect(command).not.toMatch(/cinema-ingestion-worker\.js|SUPABASE_|GO_IRL_CINEMA_WORKER_ENABLED=/);
    expect(dispatch?.credentials).toBeUndefined();
  });

  it("keeps every daily outcome terminal, idempotent-friendly, and non-publishing", () => {
    const verify = node("Verify Bounded Dispatch");
    expect(verify?.type).toBe("n8n-nodes-base.code");
    const code = String(verify?.parameters?.jsCode ?? "");

    expect(code).toContain("registry_driven_daily_enqueue");
    expect(code).toContain("['enqueued','duplicate','fail_closed']");
    expect(code).toContain("publication_authorized:false");
    expect(code).toContain("auto_publish:false");
    expect(code).toContain("telegram_auto_publish:false");
    expect(code).toContain("weekly_approval:false");

    expect(workflow.description).toContain("No cinema publication");
    expect(workflow.description).toContain("Telegram publication");
    expect(workflow.description).toContain("source activation");
  });

  it("has one schedule path and one manual dry-run path into the same bounded dispatch", () => {
    const fromSchedule = workflow.connections?.["Daily Schedule"]?.main?.[0] ?? [];
    const fromManual = workflow.connections?.["Manual Dry Run"]?.main?.[0] ?? [];
    const fromDispatch = workflow.connections?.["Dispatch Through Cinema Worker"]?.main?.[0] ?? [];

    expect(fromSchedule.map((edge) => edge.node)).toEqual(["Dispatch Through Cinema Worker"]);
    expect(fromManual.map((edge) => edge.node)).toEqual(["Dispatch Through Cinema Worker"]);
    expect(fromDispatch.map((edge) => edge.node)).toEqual(["Verify Bounded Dispatch"]);
  });

  it("contains no publication, database writer, webhook, or Telegram node", () => {
    const forbiddenNodeType = workflow.nodes.some((entry) =>
      /googleSheets|postgres|supabase|webhook|telegram/i.test(entry.type),
    );
    expect(forbiddenNodeType).toBe(false);

    const dispatch = node("Dispatch Through Cinema Worker");
    const command = String(dispatch?.parameters?.command ?? "");
    expect(command).not.toMatch(/publish|approve|telegram|schema|migration/i);
  });
});
