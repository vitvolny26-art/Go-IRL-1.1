import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = source("./city-posters/CityPostersPage.tsx");
const catalog = source("./city-posters/cinema/CinemaPostersCatalog.tsx");
const planned = source("./city-posters/cinema/cinemaPlanned.ts");
const css = source("./city-posters/cinema/cinema-posters.css");
const migration = readFileSync(new URL("../supabase/migrations/20260915170000_cinema_user_plans.sql", import.meta.url), "utf8");

describe("City Posters cinema card UX", () => {
  it("uses distinct For You and Catalog movie cards", () => {
    expect(catalog).toContain('variant === "for-you"');
    expect(catalog).toContain('className="cinema-for-you-card"');
    expect(catalog).toContain('className={plannedSurface ? "cinema-catalog-card is-planned" : "cinema-catalog-card"}');
    expect(page).toContain("CinemaPostersCatalog");
  });

  it("opens movie details from the title and uses the master-style compact calendar", () => {
    expect(catalog).toContain("setDetailsOpen(true)");
    expect(catalog).toContain('className="cinema-details-page"');
    expect(catalog).toContain('className="cinema-calendar-popover"');
    expect(catalog).toContain("monthDays(calendarMonth)");
    expect(catalog).toContain("dateSet.has(date)");
  });

  it("keeps the final For You external-card information contract", () => {
    expect(catalog).toContain("cinema-share-badge");
    expect(catalog).toContain("ratingLabel(row)");
    expect(catalog).toContain("formatDurationLabel(row.duration_minutes, language)");
    expect(catalog).toContain("cinemaStringList(row.genres).slice(0, 2)");
    expect(catalog).toContain("rowsForSelectedWeek(group, selectedDate");
    expect(catalog).toContain("audioLanguageLabel(weekRows)");
    expect(catalog).toContain("subtitleLanguageLabel(weekRows)");
    expect(catalog).toContain("screeningPeriodLabel(weekRows, language)");
    expect(catalog).toContain('className="cinema-for-you-content"');
    expect(catalog).not.toContain('className="cinema-for-you-metric-stack"');
    expect(catalog).not.toContain('className="cinema-for-you-meta"');
    expect(catalog).toContain("t.details");
    expect(catalog).toContain("t.wantToGo");
    expect(css).toContain(".cinema-for-you-primary-facts");
    expect(css).toContain(".cinema-for-you-languages");
    expect(css).toContain(".cinema-for-you-period");
    expect(css).toContain(".cinema-for-you-actions");
  });

  it("keeps For You information inert except share, date drill-down and the two primary actions", () => {
    expect(catalog).toContain('className="cinema-for-you-primary-facts"');
    expect(catalog).toContain('className="cinema-for-you-genres"');
    expect(catalog).toContain('className="cinema-for-you-languages"');
    expect(catalog).toContain('className="cinema-for-you-period" type="button" onClick={() => setCalendarOpen(true)}');
    expect(catalog).toContain('<small>{rowsForDate(group, date).length || ""}</small>');
  });

  it("drills from the date calendar into times, then cinema and an opaque ticket action", () => {
    expect(catalog).toContain("CinemaForYouScheduleSheet");
    expect(catalog).toContain("setScheduleOpen(true)");
    expect(catalog).toContain("screenings.map((screening) => <button");
    expect(catalog).toContain("setSelectedScreeningId(screening.screening_id)");
    expect(catalog).toContain("selectedScreening.cinema_name");
    expect(catalog).toContain("cinemaScreeningActionUrl({ ...selectedScreening, source_url: null })");
    expect(catalog).toContain('target="_blank" rel="noopener noreferrer">{t.tickets}</a>');
    expect(catalog).not.toContain("{selectedScreening.ticket_url}");
    expect(css).toContain(".cinema-for-you-times");
    expect(css).toContain(".cinema-for-you-screening-detail");
  });

  it("persists Want to go server-side for trusted users and projects it into Planned", () => {
    expect(planned).toContain('supabase');
    expect(planned).toContain('go_irl_list_my_cinema_plans');
    expect(planned).toContain('go_irl_set_my_cinema_plan');
    expect(planned).toContain('go_irl_remove_my_cinema_plan');
    expect(planned).toContain('local-fallback');
    expect(migration).toContain('create table if not exists public.cinema_user_plans');
    expect(migration).toContain('public.go_irl_auth_user_key()');
    expect(migration).toContain('grant execute on function public.go_irl_set_my_cinema_plan');
    expect(migration).toContain("screening.status in ('scheduled', 'sold_out', 'active')");
    expect(migration).toContain("venue.city_id = btrim(p_city_id)");
    expect(catalog).toContain('variant === "planned"');
    expect(catalog).toContain('if (plannedSurface && plannedDate)');
    expect(catalog).toContain('["city-posters", "cinema-planned", plannedUserKey]');
    expect(page).toContain("CinemaPostersCatalog");
  });

  it("keeps Catalog filters as the initial date while its date picker can see all future movie dates", () => {
    expect(catalog).toContain("const catalogSelection = useMemo");
    expect(catalog).toContain("initialDates.set(row.movie_id, row.local_date)");
    expect(catalog).toContain("futureRows(rows).filter((row) => movieIds.has(row.movie_id))");
    expect(catalog).toContain('initialDate={variant === "catalog" ? catalogSelection.initialDates.get(group.movieId) : undefined}');
  });
});
