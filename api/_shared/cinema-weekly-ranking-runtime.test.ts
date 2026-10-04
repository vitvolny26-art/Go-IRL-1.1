import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { lockCinemaWeeklyTopCandidates } from "./cinema-weekly-ranking-runtime.js";

describe("Kino000L ranking lock runtime", () => {
  it("calls the single transactional service-role RPC and validates the immutable lock result", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        weekly_selection_id: "selection-1",
        state: "ranked",
        locked_at: "2026-10-04T15:00:00.000Z",
        top_limit: 10,
        candidate_count: 7,
        publication_authorized: false,
      },
      error: null,
    }));
    const db = { rpc } as unknown as SupabaseClient;

    await expect(lockCinemaWeeklyTopCandidates({
      db,
      weeklySelectionId: "selection-1",
    })).resolves.toMatchObject({
      state: "ranked",
      candidate_count: 7,
      publication_authorized: false,
    });

    expect(rpc).toHaveBeenCalledWith("cinema_lock_weekly_publication_ranking", {
      p_weekly_selection_id: "selection-1",
    });
  });

  it("fails closed on malformed RPC results", async () => {
    const db = {
      rpc: vi.fn(async () => ({ data: { state: "collecting" }, error: null })),
    } as unknown as SupabaseClient;
    await expect(lockCinemaWeeklyTopCandidates({
      db,
      weeklySelectionId: "selection-1",
    })).rejects.toThrow(/result_invalid/);
  });
});
