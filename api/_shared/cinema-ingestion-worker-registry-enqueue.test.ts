import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { vi } from "vitest";
import { enqueueConnectedCinemaSourcesForDailyRun } from "./cinema-ingestion-worker.js";

const connected = [
  {
    id: "source-config-1",
    venue_id: "venue-1",
    source_id: "premiere_cinemas_cz",
    adapter_key: "premiere_cz",
    timezone: "Europe/Prague",
    fetch_interval_minutes: 1_440,
    cinema_venues: { city_id: "olomouc", city_name: "Olomouc", active: true, monitor_enabled: true },
  },
  {
    id: "source-config-2",
    venue_id: "venue-2",
    source_id: "unsupported_source",
    adapter_key: "unsupported_adapter",
    timezone: "Europe/Prague",
    fetch_interval_minutes: 1_440,
    cinema_venues: { city_id: "brno", city_name: "Brno", active: true, monitor_enabled: true },
  },
];

function fakeDb(insertError: { code: string } | null = null) {
  const insert = vi.fn(async () => ({ error: insertError }));
  const updateEq = vi.fn(async () => ({ error: null }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const sourceQuery = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(async () => ({ data: connected, error: null })),
  };
  sourceQuery.select.mockReturnValue(sourceQuery);
  sourceQuery.eq.mockReturnValue(sourceQuery);
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
  return { db: { from } as unknown as SupabaseClient, sourceQuery, insert, update, updateEq };
}

test("selects the canonical enabled + active + monitor-enabled registry", async () => {
  const { db, sourceQuery } = fakeDb();
  const result = await enqueueConnectedCinemaSourcesForDailyRun({
    db,
    now: new Date("2026-09-30T21:00:00.000Z"),
  });
  expect(sourceQuery.eq).toHaveBeenCalledWith("enabled", true);
  expect(sourceQuery.eq).toHaveBeenCalledWith("cinema_venues.active", true);
  expect(sourceQuery.eq).toHaveBeenCalledWith("cinema_venues.monitor_enabled", true);
  assert.equal(result.considered, 2);
});

test("enqueues registered adapters and makes unsupported adapters explicit fail-closed outcomes", async () => {
  const { db, insert } = fakeDb();
  const result = await enqueueConnectedCinemaSourcesForDailyRun({
    db,
    now: new Date("2026-09-30T21:00:00.000Z"),
  });
  assert.deepEqual(result, {
    mode: "registry_driven_daily_enqueue",
    considered: 2,
    enqueued: 1,
    duplicate: 0,
    failClosed: 1,
    outcomes: [
      {
        source_config_id: "source-config-1",
        source_id: "premiere_cinemas_cz",
        city_id: "olomouc",
        city_name: "Olomouc",
        adapter_key: "premiere_cz",
        status: "enqueued",
        reason: null,
      },
      {
        source_config_id: "source-config-2",
        source_id: "unsupported_source",
        city_id: "brno",
        city_name: "Brno",
        adapter_key: "unsupported_adapter",
        status: "fail_closed",
        reason: "adapter_unregistered",
      },
    ],
  });
  expect(insert).toHaveBeenCalledTimes(1);
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({
    source_config_id: "source-config-1",
    dedupe_key: "fetch:source-config-1:2026-09-30",
    payload: { venue_id: "venue-1", source_id: "premiere_cinemas_cz", city_id: "olomouc" },
  }));
});

test("treats same-day enqueue as a terminal duplicate rather than a second job", async () => {
  const { db } = fakeDb({ code: "23505" });
  const result = await enqueueConnectedCinemaSourcesForDailyRun({
    db,
    now: new Date("2026-09-30T21:00:00.000Z"),
  });
  assert.equal(result.enqueued, 0);
  assert.equal(result.duplicate, 1);
  assert.equal(result.failClosed, 1);
  assert.equal(result.outcomes[0].status, "duplicate");
});
