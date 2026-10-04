import { describe, expect, it } from "vitest";
import {
  canonicalCinemaMovieMatchKey,
  selectCanonicalMovieMatch,
  type CinemaMovieResolveCandidate,
} from "./cinema-movie-resolve.js";

const candidate = (overrides: Partial<CinemaMovieResolveCandidate> = {}): CinemaMovieResolveCandidate => ({
  id: "movie-1",
  title: "Mimoni a monstra",
  original_title: "Minions and Monsters",
  release_year: 2026,
  duration_minutes: 95,
  ...overrides,
});

describe("Kino000G canonical movie resolve contract", () => {
  it("matches the same film across source-local identities", () => {
    expect(selectCanonicalMovieMatch({
      title: "Mimoni a monstra",
      originalTitle: "Minions and Monsters",
      releaseYear: 2026,
      durationMinutes: 96,
    }, [candidate()])).toEqual({ status: "matched", movieId: "movie-1", candidateCount: 1 });
  });

  it("matches localized titles through original-title identity", () => {
    expect(selectCanonicalMovieMatch({
      title: "Mimoňové a příšery",
      originalTitle: "Minions and Monsters",
      releaseYear: 2026,
      durationMinutes: 95,
    }, [candidate({ title: "Minioni i potwory", original_title: "Minions and Monsters" })]).status).toBe("matched");
  });

  it("does not merge the same title across conflicting known release years", () => {
    expect(selectCanonicalMovieMatch({
      title: "Film", originalTitle: null, releaseYear: 2026, durationMinutes: 100,
    }, [candidate({ title: "Film", original_title: null, release_year: 2025, duration_minutes: 100 })]))
      .toEqual({ status: "new", candidateCount: 0 });
  });

  it("does not merge incompatible durations when year is known", () => {
    expect(selectCanonicalMovieMatch({
      title: "Film", originalTitle: null, releaseYear: 2026, durationMinutes: 100,
    }, [candidate({ title: "Film", original_title: null, release_year: 2026, duration_minutes: 116 })]).status)
      .toBe("new");
  });

  it("uses a stricter duration bound when release year is unknown", () => {
    const input = { title: "Film", originalTitle: null, releaseYear: null, durationMinutes: 100 };
    expect(selectCanonicalMovieMatch(input, [
      candidate({ title: "Film", original_title: null, release_year: 2024, duration_minutes: 105 }),
    ]).status).toBe("matched");
    expect(selectCanonicalMovieMatch(input, [
      candidate({ title: "Film", original_title: null, release_year: 2024, duration_minutes: 106 }),
    ]).status).toBe("new");
  });

  it("quarantines ambiguity instead of choosing a candidate", () => {
    expect(selectCanonicalMovieMatch({
      title: "Film", originalTitle: null, releaseYear: 2026, durationMinutes: 100,
    }, [
      candidate({ id: "a", title: "Film", original_title: null, duration_minutes: 100 }),
      candidate({ id: "b", title: "Film", original_title: null, duration_minutes: 101 }),
    ])).toEqual({ status: "ambiguous", candidateCount: 2 });
  });

  it("normalizes presentation suffixes without fuzzy title matching", () => {
    expect(canonicalCinemaMovieMatchKey("Žlutý film 3D")).toBe("zluty film");
    expect(canonicalCinemaMovieMatchKey("Žlutý film titulky")).toBe("zluty film");
    expect(canonicalCinemaMovieMatchKey("Yellow Film")).not.toBe(canonicalCinemaMovieMatchKey("Yellow Films"));
  });

  it("is deterministic for repeated decisions", () => {
    const input = { title: "Mimoni a monstra", originalTitle: "Minions and Monsters", releaseYear: 2026, durationMinutes: 95 };
    expect(selectCanonicalMovieMatch(input, [candidate()])).toEqual(selectCanonicalMovieMatch(input, [candidate()]));
  });
});
