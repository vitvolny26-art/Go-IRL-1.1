import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const entry = source("./city-posters/entry.tsx");
const page = source("./city-posters/CityPostersPage.tsx");
const catalog = source("./city-posters/cinema/CinemaPostersCatalog.tsx");
const planned = source("./city-posters/cinema/cinemaPlanned.ts");

describe("Kino001B City Posters cinema card UX", () => {
  it("swaps the approved card contracts and keeps Catalog square", () => {
    expect(catalog).toContain('variant === "for-you"');
    expect(catalog).toContain('square ? "cinema-for-you-card cinema-catalog-square-card" : "cinema-for-you-card"');
    expect(catalog).toContain('"cinema-for-you-card cinema-catalog-beauty-card is-planned"');
    expect(catalog).toContain('"cinema-for-you-card cinema-catalog-beauty-card"');
    expect(catalog).toContain('className="cinema-for-you-artwork"');
    expect(catalog).toContain('className="cinema-for-you-bottom-panel"');
    expect(catalog).toContain('className="cinema-for-you-actions"');
    expect(catalog).toContain('cinema-catalog-grid cinema-beauty-card-grid');
    expect(catalog).toContain('square = false');
    expect(catalog).toContain('"cinema-for-you-card cinema-catalog-square-card"');
    expect(catalog).toContain(".cinema-catalog-square-card{min-height:0;aspect-ratio:1/1}");
    expect(page).toContain("CinemaPostersCatalog");
    expect(page).not.toContain("CinemaVisualFixture");
  });

  it("requests the higher-quality poster variant when the source exposes image parameters", () => {
    expect(catalog).toContain("const highQualityPosterUrl");
    expect(catalog).toContain('url.searchParams.set("width", "1440")');
    expect(catalog).toContain('url.searchParams.set("quality", "95")');
  });

  it("opens movie details and reuses the master-style compact calendar", () => {
    expect(catalog).toContain("setDetailsOpen(true)");
    expect(catalog).toContain('className="cinema-details-page"');
    expect(catalog).toContain('className="cinema-calendar-popover"');
    expect(catalog).toContain("monthDays(calendarMonth)");
    expect(catalog).toContain("dateSet.has(date)");
    expect(catalog).toContain('<small>{rowsForDate(group, date).length || ""}</small>');
  });

  it("keeps the final For You information contract on the stable Beauty card classes", () => {
    expect(catalog).toContain("cinema-share-badge");
    expect(catalog).toContain("formatDurationLabel(row.duration_minutes, language)");
    expect(catalog).toContain("cinemaStringList(row.genres).slice(0, 2)");
    expect(catalog).toContain("rowsForSelectedWeek(group, selectedDate");
    expect(catalog).toContain("audioLanguageLabel(weekRows)");
    expect(catalog).toContain("subtitleLanguageLabel(weekRows)");
    expect(catalog).toContain("screeningPeriodLabel(weekRows, language)");
    expect(catalog).toContain('className="cinema-for-you-metric-stack"');
    expect(catalog).toContain('<div className="cinema-for-you-title">');
    expect(catalog).toContain('className="cinema-for-you-meta" type="button" onClick={() => setCalendarOpen(true)}');
    expect(catalog).toContain('className="cinema-for-you-actions"');
    expect(catalog).not.toContain('className="cinema-for-you-content"');
  });

  it("pins Cinema styling to the City Posters entry and keeps a runtime presentation fallback", () => {
    expect(entry).toContain('import "./sport-visual-fixture.css";\nimport "./cinema/cinema-posters.css";');
    expect(catalog).not.toContain('import "./cinema-posters.css";');
    expect(catalog).toContain("const cinemaRuntimeFallbackCss");
    expect(catalog).toContain("data-go-irl-cinema-runtime-fallback");
    expect(catalog.match(/data-go-irl-cinema-runtime-fallback/g)?.length).toBe(3);
    expect(catalog).toContain(".cinema-for-you-grid,.cinema-beauty-card-grid{display:grid");
    expect(catalog).toContain(".cinema-for-you-card{position:relative");
    expect(catalog).toContain(".cinema-for-you-top-badges{position:absolute");
    expect(catalog).toContain(".cinema-sheet-backdrop{position:fixed");
    expect(catalog).toContain(".cinema-calendar-grid button:disabled{opacity:.35}");
    expect(catalog).toContain(".cinema-calendar-popover .cinema-details-times a");
  });

  it("keeps informational fields inert while date drill-down reaches times, cinema and opaque ticket action", () => {
    expect(catalog).toContain("CinemaForYouScheduleSheet");
    expect(catalog).toContain("setScheduleOpen(true)");
    expect(catalog).toContain("setSelectedScreeningId(screening.screening_id)");
    expect(catalog).toContain("selectedScreening.cinema_name");
    expect(catalog).toContain("cinemaScreeningActionUrl({ ...selectedScreening, source_url: null })");
    expect(catalog).toContain('target="_blank" rel="noopener noreferrer"><strong>{t.tickets}</strong></a>');
    expect(catalog).not.toContain("{selectedScreening.ticket_url}");
  });

  it("persists Want to go server-side for trusted users and projects it into Planned", () => {
    expect(planned).toContain('supabase');
    expect(planned).toContain('go_irl_list_my_cinema_plans');
    expect(planned).toContain('go_irl_set_my_cinema_plan');
    expect(planned).toContain('go_irl_remove_my_cinema_plan');
    expect(planned).toContain('local-fallback');
    expect(catalog).toContain('variant === "planned"');
    expect(catalog).toContain('if (plannedSurface && plannedDate)');
    expect(catalog).toContain('["city-posters", "cinema-planned", plannedUserKey]');
    expect(page).toContain("CinemaPostersCatalog");
  });

  it("keeps Catalog filters as the initial date while its date picker can see all future movie dates", () => {
    expect(catalog).toContain("const catalogSelection = useMemo");
    expect(catalog).toContain("initialDates.set(row.movie_id, row.local_date)");
    expect(catalog).toContain("futureRows(rows).filter((row) => movieIds.has(row.movie_id))");
    expect(catalog).toContain('initialDate={catalogSelection.initialDates.get(group.movieId)}');
  });
});
