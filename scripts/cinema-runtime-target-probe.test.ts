import { describe, expect, it } from "vitest";

const expectedTestHost = "fgajrdwtpvmhgnxhwjqs.supabase.co";

describe("cinema server runtime target probe", () => {
  it("reports only the Supabase hostname and secret presence", () => {
    const rawUrl = process.env.SUPABASE_URL || "";
    const host = rawUrl ? new URL(rawUrl).hostname : "missing";
    const hasServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
    console.warn("cinema_runtime_target_probe", { host, hasServiceRole });

    // This probe must never silently authorize writes to an unknown target.
    expect([expectedTestHost, "missing"]).toContain(host);
  });
});
