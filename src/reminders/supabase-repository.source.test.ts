import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./supabase-repository.ts", import.meta.url), "utf8");

describe("Supabase reminder hydration retry source contract", () => {
  it("retries the three required hydration reads and preserves bounded diagnostics", () => {
    const start = source.indexOf("const [identityResult, eventResult, userResult]");
    const end = source.indexOf("let previousParticipationTelegramMessageId", start);
    const hydration = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(hydration.match(/withTransientSupabaseRpcRetry/g)).toHaveLength(3);
    expect(hydration).toContain("reminder_identity_load_failed:${describeSupabaseRpcError(identityResult.error)}");
    expect(hydration).toContain("reminder_event_load_failed:${describeSupabaseRpcError(eventResult.error)}");
    expect(hydration).toContain("reminder_language_load_failed:${describeSupabaseRpcError(userResult.error)}");
    expect(hydration).not.toContain('error.code || "unknown"');
  });

  it("retries the T-3 participation lookup without changing its best-effort fallback", () => {
    const start = source.indexOf('if (reminder.provider === "telegram" && reminder.lead_minutes === 180)');
    const end = source.indexOf("return hydrateReminderDelivery", start);
    const participationLookup = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(participationLookup).toContain("const previousResult = await withTransientSupabaseRpcRetry(() =>");
    expect(participationLookup).toContain("if (!previousResult.error)");
  });
});
