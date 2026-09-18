import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const catalog = source("./city-posters/cinema/CinemaPostersCatalog.tsx");
const css = source("./city-posters/cinema/cinema-posters.css");

const details = catalog.slice(
  catalog.indexOf("function CinemaMovieDetails"),
  catalog.indexOf("function CatalogMovieCard"),
);
const detailsSchedule = catalog.slice(
  catalog.indexOf("function CinemaDetailsSchedule"),
  catalog.indexOf("function CinemaDateCalendar"),
);

describe("Kino001C Cinema full details page", () => {
  it("renders the agreed movie information and keeps director/cast conditional", () => {
    expect(details).toContain("row.movie_title");
    expect(details).toContain("row.original_title");
    expect(details).toContain("row.release_year");
    expect(details).toContain("row.age_rating");
    expect(details).toContain("cinemaStringList(row.genres)");
    expect(details).toContain("ratingLabel(row)");
    expect(details).toContain("formatDurationLabel(row.duration_minutes, language)");
    expect(details).toContain("row.description");
    expect(details).toContain("audioLanguageLabel(dayRows)");
    expect(details).toContain("subtitleLanguageLabel(dayRows)");
    expect(details).toContain("versionTypeLabel(dayRows)");
    expect(details).toContain("row.director");
    expect(details).toContain("row.lead_actors");
    expect(details).toContain('className="cinema-details-credits"');
  });

  it("uses the date range as the calendar trigger and preserves per-day screening counts", () => {
    expect(details).toContain("screeningPeriodLabel(weekRows, language)");
    expect(details).toContain("setCalendarOpen(true)");
    expect(catalog).toContain("dateSet.has(date)");
    expect(catalog).toContain('<small>{rowsForDate(group, date).length || ""}</small>');
  });

  it("drills down from showtime to cinema and hides the raw ticket URL behind Tickets", () => {
    expect(detailsSchedule).toContain("screening.local_time");
    expect(detailsSchedule).toContain("setSelectedScreeningId(screening.screening_id)");
    expect(detailsSchedule).toContain("selectedScreening.cinema_name");
    expect(detailsSchedule).toContain("cinemaScreeningActionUrl({ ...selectedScreening, source_url: null })");
    expect(detailsSchedule).toContain('target="_blank" rel="noopener noreferrer"><strong>{t.tickets}</strong></a>');
    expect(detailsSchedule).not.toContain("{selectedScreening.ticket_url}");
  });

  it("does not render the fields explicitly removed from the full details page", () => {
    expect(detailsSchedule).not.toContain("cinema_address");
    expect(detailsSchedule).not.toContain("cinemaScreeningTags");
    expect(detailsSchedule).not.toContain("auditorium");
    expect(detailsSchedule).not.toContain("screening.format");
    expect(detailsSchedule).not.toContain("ends_at");
    expect(details).not.toContain("venueNamesForDate(group, selectedDate)");
    expect(details).not.toContain("t.cinemas");
  });

  it("keeps the details schedule interactive and styled without exposing technical fields", () => {
    expect(css).toContain(".cinema-details-times > button");
    expect(css).toContain(".cinema-details-back");
    expect(css).toContain(".cinema-details-credits");
    expect(details).toContain("CinemaDetailsSchedule key={selectedDate}");
    expect(details).toContain("t.wantToGo");
  });
});
