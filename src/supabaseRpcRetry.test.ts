import { describe, expect, it } from "vitest";
import {
  describeSupabaseRpcError,
  isTransientSupabaseRpcError,
  withTransientSupabaseRpcRetry,
} from "./supabaseRpcRetry.js";

describe("withTransientSupabaseRpcRetry", () => {
  it("retries once when the RPC error has no PostgREST code", async () => {
    let attempts = 0;
    const result = await withTransientSupabaseRpcRetry(async () => {
      attempts += 1;
      return attempts === 1
        ? { data: null, error: { code: "", message: "fetch failed" } }
        : { data: ["ok"], error: null };
    }, { delayMs: 0 });

    expect(attempts).toBe(2);
    expect(result.error).toBeNull();
    expect(result.data).toEqual(["ok"]);
  });

  it("does not retry a coded database or PostgREST failure", async () => {
    let attempts = 0;
    const result = await withTransientSupabaseRpcRetry(async () => {
      attempts += 1;
      return { data: null, error: { code: "23514", message: "constraint failed" } };
    }, { delayMs: 0 });

    expect(attempts).toBe(1);
    expect(result.error?.code).toBe("23514");
  });

  it("keeps diagnostics bounded", () => {
    const diagnostic = describeSupabaseRpcError({ code: "", message: "fetch failed" });
    expect(diagnostic).toBe("unknown:fetch failed");
    expect(diagnostic.length).toBeLessThanOrEqual(80);
  });

  it("classifies only missing-code failures as transient", () => {
    expect(isTransientSupabaseRpcError({ code: null, message: "fetch failed" })).toBe(true);
    expect(isTransientSupabaseRpcError({ code: "PGRST116", message: "not found" })).toBe(false);
  });
});
