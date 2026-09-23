import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  enqueueKino001BWorkerReadySources,
  kino001bWorkerReadySourceIds,
} from "./cinema-ingestion-worker.js";

const dueSource = {
  id: "source-config-1",
  venue_id: "venue-1",
  source_id: "uk_kyiv_planetakino",
  timezone: "Europe/Kyiv",
  fetch_interval_minutes: 1_440,
};

function fakeDb(insertError: { code: string } | null = null) {
  const insert = vi.fn(async () => ({ error: insertError }));
  const updateEq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const sourceQuery = {
    select: vi.fn(),
    in: vi.fn(),
    eq: vi.fn(),
    lte: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(async () => ({ data: [dueSource], error: null })),
  };
  sourceQuery.select.mockReturnValue(sourceQuery);
  sourceQuery.in.mockReturnValue(sourceQuery);
  sourceQuery.eq.mockReturnValue(sourceQuery);
  sourceQuery.lte.mockReturnValue(sourceQuery);
  sourceQuery.order.mockReturnValue(sourceQuery);
  const from = vi.fn((table: string) => {
    if (table === "cinema_sources") {
      return from.mock.calls.filter(([name]) => name === "cinema_sources").length === 1
        ? sourceQuery
        : { update };
    }
    if (table === "cinema_ingestion_jobs") return { insert };
    throw new Error(`unexpected_table:${table}`);
  });
  return { db: { from } as unknown as SupabaseClient, insert, update, updateEq };
}

describe("Kino001B worker-ready enqueue bridge", () => {
  it("keeps the worker-side allowlist exact and fail-closed", () => {
    expect(kino001bWorkerReadySourceIds).toEqual([
      "uk_kyiv_planetakino",
      "cs_prague_cinestar",
      "cs_prague_premiere",
      "sk_bratislava_cinemax",
    ]);
  });

  it("enqueues a due allowlisted source and advances its schedule", async () => {
    const { db, insert, update, updateEq } = fakeDb();
    const result = await enqueueKino001BWorkerReadySources({
      db,
      now: new Date("2026-09-23T06:00:00.000Z"),
    });

    expect(result).toEqual({
      considered: 1,
      enqueued: 1,
      duplicate: 0,
      sourceIds: ["uk_kyiv_planetakino"],
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      job_type: "FETCH",
      source_config_id: "source-config-1",
      dedupe_key: "fetch:source-config-1:2026-09-23",
      payload: { venue_id: "venue-1", source_id: "uk_kyiv_planetakino" },
    }));
    expect(update).toHaveBeenCalledWith({
      last_attempt_at: "2026-09-23T06:00:00.000Z",
      next_fetch_at: "2026-09-24T06:00:00.000Z",
    });
    expect(updateEq).toHaveBeenCalledWith("id", "source-config-1");
  });

  it("treats a dedupe conflict as a bounded duplicate", async () => {
    const { db } = fakeDb({ code: "23505" });
    await expect(enqueueKino001BWorkerReadySources({
      db,
      now: new Date("2026-09-23T06:00:00.000Z"),
    })).resolves.toMatchObject({ enqueued: 0, duplicate: 1, sourceIds: [] });
  });

  it("uses the already-governed restart path without requiring a root helper update", () => {
    const helper = readFileSync(new URL("../../ops/workerctl/go-irl-cinema-workerctl", import.meta.url), "utf8");
    const entrypoint = readFileSync(new URL("../../scripts/cinema-ingestion-worker.ts", import.meta.url), "utf8");
    expect(helper).toContain("restart_service()");
    expect(helper).toContain("restart <sha>");
    expect(helper).not.toContain("enqueue-due");
    expect(entrypoint).toContain("kino001b_startup_enqueue");
    expect(entrypoint).toContain("await enqueueKino001BWorkerReadySources()");
  });
});
