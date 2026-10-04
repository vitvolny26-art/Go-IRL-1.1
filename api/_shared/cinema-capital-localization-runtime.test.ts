import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  loadCinemaCapitalLocalizationInventory,
  persistCinemaCapitalLocalizationSearchResult,
} from "./cinema-capital-localization-runtime.js";
import { CINEMA_CAPITAL_LOCALIZATION_TARGETS } from "./cinema-capital-localization-search.js";

const chain = (result: unknown) => {
  const query: Record<string, any> = {};
  for (const method of ["select", "eq", "lte", "order", "in"]) query[method] = vi.fn(() => query);
  query.single = vi.fn(async () => result);
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return query;
};

describe("Kino000M localization runtime", () => {
  it("loads only a locked weekly Top-10 inventory and expands each movie to six capital targets", async () => {
    const selectionQuery = chain({ data: { id: "selection-1", state: "ranked", top_limit: 10, locked_at: "2026-10-04T15:00:00Z" }, error: null });
    const candidateQuery = chain({ data: [{
      weekly_selection_id: "selection-1",
      candidate_id: "candidate-1",
      movie_id: "movie-1",
      rank: 1,
      publication_authorized: false,
    }], error: null });
    const movieQuery = chain({ data: [{
      id: "movie-1",
      title: "Dune",
      original_title: "Dune",
      release_year: 2021,
      duration_minutes: 155,
      imdb_id: "tt1160419",
      external_ids: { tmdb: 438631 },
    }], error: null });

    const from = vi.fn((table: string) => {
      if (table === "cinema_weekly_publication_selections") return selectionQuery;
      if (table === "cinema_weekly_publication_candidates") return candidateQuery;
      if (table === "cinema_movies") return movieQuery;
      throw new Error(`unexpected table ${table}`);
    });
    const db = { from } as unknown as SupabaseClient;
    const items = await loadCinemaCapitalLocalizationInventory({ db, weeklySelectionId: "selection-1" });

    expect(items).toHaveLength(1);
    expect(items[0].rank).toBe(1);
    expect(items[0].targets).toHaveLength(6);
    expect(items[0].targets.map((target) => target.capital)).toEqual([
      "Moscow", "Kyiv", "Prague", "London", "Warsaw", "Bratislava",
    ]);
  });

  it("fails closed when a weekly candidate is already publication-authorized", async () => {
    const selectionQuery = chain({ data: { id: "selection-1", state: "ranked", top_limit: 10, locked_at: "2026-10-04T15:00:00Z" }, error: null });
    const candidateQuery = chain({ data: [{
      weekly_selection_id: "selection-1",
      candidate_id: "candidate-1",
      movie_id: "movie-1",
      rank: 1,
      publication_authorized: true,
    }], error: null });
    const db = { from: vi.fn((table: string) => table.includes("selections") ? selectionQuery : candidateQuery) } as unknown as SupabaseClient;
    await expect(loadCinemaCapitalLocalizationInventory({ db, weeklySelectionId: "selection-1" }))
      .rejects.toThrow(/already_authorized/);
  });

  it("persists provenance to the dedicated search-result store without touching canonical movies", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
      expect(table).toBe("cinema_weekly_localization_search_results");
      return { upsert };
    });
    const db = { from } as unknown as SupabaseClient;

    const row = await persistCinemaCapitalLocalizationSearchResult({
      db,
      weeklySelectionId: "selection-1",
      candidateId: "candidate-1",
      movieId: "movie-1",
      target: CINEMA_CAPITAL_LOCALIZATION_TARGETS[3],
      result: {
        status: "matched",
        confidence: 1,
        match_basis: "external_id",
        candidate: {
          provider_candidate_id: "uk-source-1",
          title: "Dune",
          original_title: "Dune",
          release_year: 2021,
          duration_minutes: 155,
          external_ids: { imdb: "tt1160419" },
          localized_title: "Dune",
          synopsis: "English synopsis",
          source_url: "https://cinema.example/dune",
          source_name: "Cinema",
          source_kind: "official_cinema",
        },
      },
    });

    expect(row).toMatchObject({ locale: "en", capital: "London", status: "matched" });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      movie_id: "movie-1",
      source_url: "https://cinema.example/dune",
      source_kind: "official_cinema",
    }), { onConflict: "weekly_selection_id,candidate_id,locale" });
  });
});
