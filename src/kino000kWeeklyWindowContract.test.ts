import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const window = source("../api/_shared/cinema-weekly-window.ts");
const runtime = source("../api/_shared/cinema-weekly-window-runtime.ts");
const migration = source("../supabase/migrations/20261004162000_kino000k_weekly_window.sql");

describe("Kino000K weekly window contract", () => {
  it("uses the Prague local calendar and an exact Monday-Sunday next-week window", () => {
    expect(window).toContain('CINEMA_WEEKLY_TIMEZONE = "Europe/Prague"');
    expect(window).toContain("daysUntilNextMonday = 8 - isoWeekday(localDate)");
    expect(window).toContain("week_end: weekEnd");
    expect(migration).toContain("p_week_end <> p_week_start + 6");
    expect(migration).toContain("extract(isodow from p_week_start) <> 1");
    expect(migration).toContain("extract(isodow from p_week_end) <> 7");
  });

  it("selects only active daily candidates whose showing window intersects the weekly window", () => {
    expect(runtime).toContain('.from("cinema_daily_movie_city_candidates")');
    expect(runtime).toContain('.eq("lifecycle_status", "active")');
    expect(runtime).toContain('.lte("showing_from", window.week_end)');
    expect(runtime).toContain('.gte("showing_until", window.week_start)');
  });

  it("creates one idempotent collecting selection without ranking or publication authorization", () => {
    expect(migration).toContain("cinema_get_or_create_weekly_publication_selection");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("'collecting'");
    expect(runtime).toContain("publication_authorized: false");
    expect(runtime).toContain("ranking_locked: false");
  });

  it("does not write weekly candidates, rank Top-10, send Telegram, or publish", () => {
    expect(runtime).not.toContain("cinema_weekly_publication_candidates");
    expect(runtime).not.toContain("telegram");
    expect(runtime).not.toContain("publishCinema");
    expect(migration).not.toContain("insert into public.cinema_weekly_publication_candidates");
  });

  it("keeps the persistence RPC service-role only", () => {
    expect(migration).toContain("revoke all on function public.cinema_get_or_create_weekly_publication_selection");
    expect(migration).toContain("grant execute on function public.cinema_get_or_create_weekly_publication_selection");
    expect(migration).toContain("to service_role");
  });
});
