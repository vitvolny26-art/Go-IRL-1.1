import { describe, expect, it } from "vitest";
import {
  loadCinemaPlanned,
  removeCinemaPlanned,
  setCinemaPlannedDate,
} from "./cinemaPlanned";

const movieId = "01cfe105-8e8c-4a47-acae-9b4fef300afc";
const trusted = async () => ({ source: "trusted-telegram" });

describe("cinema planned repository", () => {
  it("loads trusted-user plans from the server RPC", async () => {
    const calls: string[] = [];
    const snapshot = await loadCinemaPlanned({
      browserMock: false,
      initializeAuth: trusted,
      client: {
        rpc: async (name) => {
          calls.push(name);
          return {
            data: [{ city_id: "olomouc", movie_id: movieId, planned_date: "2026-09-21", saved_at: "2026-09-15T16:00:00Z" }],
            error: null,
          };
        },
      },
    });

    expect(calls).toEqual(["go_irl_list_my_cinema_plans"]);
    expect(snapshot.source).toBe("server");
    expect(snapshot.items).toEqual([{ cityId: "olomouc", movieId, date: "2026-09-21", savedAt: "2026-09-15T16:00:00Z" }]);
  });

  it("saves and refreshes a trusted-user plan", async () => {
    const calls: string[] = [];
    const source = await setCinemaPlannedDate("olomouc", movieId, "2026-09-22", {
      browserMock: false,
      initializeAuth: trusted,
      client: {
        rpc: async (name) => {
          calls.push(name);
          if (name === "go_irl_set_my_cinema_plan") return { data: [{ status: "saved" }], error: null };
          return {
            data: [{ city_id: "olomouc", movie_id: movieId, planned_date: "2026-09-22", saved_at: "2026-09-15T16:01:00Z" }],
            error: null,
          };
        },
      },
    });

    expect(source).toBe("server");
    expect(calls).toEqual(["go_irl_set_my_cinema_plan", "go_irl_list_my_cinema_plans"]);
  });

  it("removes and refreshes a trusted-user plan", async () => {
    const calls: string[] = [];
    const source = await removeCinemaPlanned("olomouc", movieId, {
      browserMock: false,
      initializeAuth: trusted,
      client: {
        rpc: async (name) => {
          calls.push(name);
          if (name === "go_irl_remove_my_cinema_plan") return { data: true, error: null };
          return { data: [], error: null };
        },
      },
    });

    expect(source).toBe("server");
    expect(calls).toEqual(["go_irl_remove_my_cinema_plan", "go_irl_list_my_cinema_plans"]);
  });

  it("fails over locally only when the planned RPC is not deployed", async () => {
    const snapshot = await loadCinemaPlanned({
      browserMock: false,
      initializeAuth: trusted,
      client: { rpc: async () => ({ data: null, error: { code: "PGRST202" } }) },
    });

    expect(snapshot.source).toBe("local-fallback");
    expect(snapshot.items).toEqual([]);
  });
});
