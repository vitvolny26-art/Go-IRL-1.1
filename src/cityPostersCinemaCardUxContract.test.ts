import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const entry = source("./city-posters/entry.tsx");
const page = source("./city-posters/CityPostersPage.tsx");
const catalog = source("./city-posters/cinema/CinemaPostersCatalog.tsx");
const planned = source("./city-posters/cinema/cinemaPlanned.ts");

describe("Kino001B City Posters cinema card UX", () => {
  it("routes For You and Catalog through matching card renderers while keeping Catalog square", () => {
    const forYouBranch = catalog.slice(
      catalog.indexOf('if (variant === "for-you")'),
      catalog.indexOf('if (variant === "catalog")'),
    );
    const catalogBranch = catalog.slice(
      catalog.indexOf('if (variant === "catalog")'),
      catalog.lastIndexOf('  return <><style data-go-irl-cinema-runtime-fallback>'),
    );
    expect(forYouBranch).toContain("<ForYouMovieCard");
    expect(forYouBranch).not.toContain("<CatalogMovieCard");
    expect(catalogBranch).toContain("<CatalogMovieCard");
    expect(catalogBranch).not.toContain("<ForYouMovieCard");
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
    expect(catalog).toContain('url.searchParams.set("width", "2160")');
    expect(catalog).toContain('url.searchParams.set("quality", "100")');
    expect(catalog).toContain('premierecinemas\\.cz');
    expect(catalog).toContain('url.hostname === "image.tmdb.org"');
    expect(catalog).toContain("const detailsPosterUrl = highQualityPosterUrl(row.poster_url)");
    expect(catalog).toContain('className="cinema-details-poster">{detailsPosterUrl ? <img src={detailsPosterUrl}');
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
    const forYouCard = catalog.slice(
      catalog.indexOf("function ForYouMovieCard"),
      catalog.indexOf("const futureRows"),
    );
    expect(forYouCard).toContain("cinema-share-badge");
    expect(forYouCard).toContain("formatDurationLabel(row.duration_minutes, language)");
    expect(forYouCard).toContain("cinemaStringList(row.genres).slice(0, 2)");
    expect(forYouCard).toContain("rowsForSelectedWeek(group, selectedDate");
    expect(forYouCard).toContain("audioLanguageLabel(weekRows)");
    expect(forYouCard).toContain("screeningPeriodLabel(weekRows, language)");
    expect(forYouCard).toContain("<strong>IMDb {ratingLabel(row)}</strong>");
    expect(forYouCard).not.toContain("venueNamesForDate(group, selectedDate)");
    expect(catalog).toContain("cinema-share-badge");
    expect(catalog).toContain("formatDurationLabel(row.duration_minutes, language)");
    expect(catalog).toContain("cinemaStringList(row.genres).slice(0, 2)");
    expect(catalog).toContain("rowsForSelectedWeek(group, selectedDate");
    expect(catalog).toContain("audioLanguageLabel(weekRows)");
    expect(catalog).toContain("subtitleLanguageLabel(weekRows)");
    expect(catalog).toContain("subtitleLanguages");
    expect(catalog).toContain('const languageSummary = [audioLanguages, subtitleLanguages].filter(Boolean).join(" · ")');
    expect(catalog).toContain('<strong>{languageSummary || "—"}</strong>');
    expect(catalog).toContain("screeningPeriodLabel(weekRows, language)");
    expect(catalog).toContain('className="card-share-forward-icon"');
    expect(catalog).toContain('M10 45C16 30 27 23 42 23V13L56 28 42 43V33C29 33 20 37 10 45Z');
    expect(catalog).not.toContain('<Clock3 /><span>{t.duration}</span><strong>{duration}</strong>');
    expect(catalog).not.toContain('<Languages /><span><small>{t.language}</small>');
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
    const forYouCard = catalog.slice(
      catalog.indexOf("function ForYouMovieCard"),
      catalog.indexOf("const futureRows"),
    );
    const scheduleSheet = catalog.slice(
      catalog.indexOf("function CinemaForYouScheduleSheet"),
      catalog.indexOf("function CinemaMovieDetails"),
    );
    expect(forYouCard).toContain('const [scheduleOpen, setScheduleOpen] = useState(false)');
    expect(forYouCard).toContain('onSelect={(date) => { setSelectedDate(date); setScheduleOpen(true); }}');
    expect(forYouCard).toContain('scheduleOpen ? <CinemaForYouScheduleSheet');
    expect(forYouCard).toContain('<strong>IMDb {ratingLabel(row)}</strong>');
    expect(forYouCard).toContain('{duration ? <div className="cinema-card-badge"><span>{t.duration}</span><strong>{duration}</strong></div> : null}');
    expect(forYouCard).toContain('cinemaStringList(row.genres).slice(0, 2)');
    expect(forYouCard).toContain('<div className="cinema-for-you-meta"><span><small>{t.language}</small><strong>{languageSummary || "—"}</strong></span></div>');
    expect(forYouCard).toContain('className="cinema-for-you-meta" type="button" onClick={() => setCalendarOpen(true)}');
    expect(scheduleSheet).toContain('screenings.map((screening) => <button className="cinema-catalog-date"');
    expect(scheduleSheet).toContain('<strong>{screening.local_time}</strong>');
    expect(scheduleSheet).toContain("setSelectedScreeningId(screening.screening_id)");
    expect(scheduleSheet).toContain("selectedScreening.cinema_name");
    expect(scheduleSheet).toContain("cinemaScreeningActionUrl({ ...selectedScreening, source_url: null })");
    expect(scheduleSheet).toContain('target="_blank" rel="noopener noreferrer"><strong>{t.tickets}</strong></a>');
    expect(scheduleSheet).not.toContain("{selectedScreening.ticket_url}");
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
