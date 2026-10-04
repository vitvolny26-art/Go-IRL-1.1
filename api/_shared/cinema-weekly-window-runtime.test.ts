import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  ensureCinemaWeeklyWindowSelection,
  loadCinemaWeeklyWindow,
} from "./cinema-weekly-window-runtime.js";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "candidate-1",
  movie_id: "movie-1",
  city_id: "olomouc",
  city_name: "Olomouc",
  title: "Movie",
  showing_from: "2026-10-05",
  showing_until: "2026-10-11",
  score: 50,
  priority: "store",
  lifecycle_status: "active",
  ...overrides,
});

function fakeDb(pages: unknown[][]) {
  let page = 0;
  const queries: Array<Record<string, ReturnType<typeof vi.fn>>> = [];
  const rpc = vi.fn(async () => ({ data: "selection-1", error: null }));
  const from = vi.fn(() => {
    const query: Record<string, ReturnType<typeof vi.fn>> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.lte = vi.fn(() => query);
    query.gte = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.range = vi.fn(async () => ({ data: pages[page++] ?? [], error: null }));
    queries.push(query);
    return query;
  });
  return { db: { from, rpc } as unknown as SupabaseClient, queries, rpc };
}

describe("Kino000K weekly window runtime", () => {
  it("loads only active daily candidates intersecting the next weekly window", async () => {
    const { db, queries } = fakeDb([[row()]]);
    const result = await loadCinemaWeeklyWindow({
      db,
      cityId: "olomouc",
      now: new Date("2026-10-04T04:00:00.000Z"),
    });

    expect(result).toMatchObject({
      mode: "weekly_window",
      publication_authorized: false,
      ranking_locked: false,
      city_id: "olomouc",
      timezone: "Europe/Prague",
      week_start: "2026-10-05",
      week_end: "2026-10-11",
      eligible_candidate_count: 1,
    });
    expect(queries[0].eq).toHaveBeenCalledWith("city_id", "olomouc");
    expect(queries[0].eq).toHaveBeenCalledWith("lifecycle_status", "active");
    expect(queries[0].lte).toHaveBeenCalledWith("showing_from", "2026-10-11");
    expect(queries[0].gte).toHaveBeenCalledWith("showing_until", "2026-10-05");
  });

  it("paginates candidate loading without silent truncation", async () => {
    const { db, queries } = fakeDb([
      [row({ id: "a" }), row({ id: "b", movie_id: "movie-2", title: "B" })],
      [row({ id: "c", movie_id: "movie-3", title: "C" })],
    ]);
    const result = await loadCinemaWeeklyWindow({
      db,
      cityId: "olomouc",
      now: new Date("2026-10-04T04:00:00.000Z"),
      pageSize: 2,
    });
    expect(result.eligible_candidate_count).toBe(3);
    expect(queries[0].range).toHaveBeenCalledWith(0, 1);
    expect(queries[1].range).toHaveBeenCalledWith(2, 3);
  });

  it("persists only the selection identity through the service-role RPC", async () => {
    const { db, rpc } = fakeDb([]);
    await expect(ensureCinemaWeeklyWindowSelection({
      db,
      cityId: "olomouc",
      weekStart: "2026-10-05",
      weekEnd: "2026-10-11",
    })).resolves.toBe("selection-1");

    expect(rpc).toHaveBeenCalledWith("cinema_get_or_create_weekly_publication_selection", {
      p_city_id: "olomouc",
      p_week_start: "2026-10-05",
      p_week_end: "2026-10-11",
    });
  });
});
