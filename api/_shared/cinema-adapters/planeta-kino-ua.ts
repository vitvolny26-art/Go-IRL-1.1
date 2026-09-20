import { createHash } from "node:crypto";
import type {
  CinemaAdapter,
  CinemaFetchedPage,
  CinemaNormalizedScreening,
  CinemaParseResult,
  CinemaSourceConfig,
} from "../cinema-ingestion-types.js";

const userAgent = "GO-IRL-Cinema-Ingestion/2.0 (+schedule archival; contact via GO IRL)";
const requestTimeoutMs = 20_000;
const ukrainianMonths: Record<string, number> = {
  "січня": 1, "лютого": 2, "березня": 3, "квітня": 4, "травня": 5, "червня": 6,
  "липня": 7, "серпня": 8, "вересня": 9, "жовтня": 10, "листопада": 11, "грудня": 12,
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const decodeHtml = (value: string) => value
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;|&#160;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;|&#34;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/\s+/g, " ")
  .trim();
const slug = (value: string) => value.toLocaleLowerCase("uk-UA").normalize("NFKC")
  .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");

const localDateInZone = (iso: string, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(iso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};
const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const zoneOffsetMs = (instant: Date, timeZone: string) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day), Number(value.hour), Number(value.minute), Number(value.second)) - instant.getTime();
};
const zonedLocalToIso = (local: string, timeZone: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00$/.exec(local);
  if (!match) throw new Error("invalid_local_datetime");
  const [, y, m, d, hh, mm] = match;
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm));
  let offset = zoneOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset;
  const corrected = zoneOffsetMs(new Date(utc), timeZone);
  if (corrected !== offset) { offset = corrected; utc = guess - offset; }
  return new Date(utc).toISOString();
};
const parseUkrainianDate = (dayRaw: string, monthRaw: string, fetchedAt: string, timeZone: string) => {
  const day = Number(dayRaw);
  const month = ukrainianMonths[monthRaw.toLocaleLowerCase("uk-UA")];
  if (!day || !month || day > 31) return null;
  const fetchedLocalDate = localDateInZone(fetchedAt, timeZone);
  const currentYear = Number(fetchedLocalDate.slice(0, 4));
  const currentMonth = Number(fetchedLocalDate.slice(5, 7));
  const year = month < currentMonth - 6 ? currentYear + 1 : month > currentMonth + 6 ? currentYear - 1 : currentYear;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const fetchText = async (url: string): Promise<CinemaFetchedPage> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow", signal: controller.signal,
      headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`http_${response.status}`);
    if (!body.trim()) throw new Error("empty_body");
    return { url: response.url || url, status: response.status, body };
  } finally { clearTimeout(timer); }
};

export const parsePlanetaKinoPage = (source: CinemaSourceConfig, page: CinemaFetchedPage, fetchedAt: string) => {
  const html = page.body;
  const rows: CinemaNormalizedScreening[] = [];
  const errors: string[] = [];
  let rejected = 0;
  if (!html.includes('data-component-name="MovieWithSessionsCard"') || !html.includes('data-component-name="SessionItem"')) {
    return { rows, errors: ["schedule_cards_missing"], rejected };
  }
  if (/captcha|just a moment|attention required|sorry, you have been blocked/i.test(html)) {
    return { rows, errors: ["challenge_response"], rejected };
  }
  const dateMatch = html.match(/Сьогодні[\s\S]{0,500}?([0-3]?\d)\s+([А-Яа-яІіЇїЄєҐґ]+)/i);
  const projectionDate = dateMatch ? parseUkrainianDate(dateMatch[1], dateMatch[2], fetchedAt, source.timezone) : null;
  if (!projectionDate) return { rows, errors: ["projection_date_missing"], rejected };

  const cards = html.split('<div data-component-name="MovieWithSessionsCard"').slice(1);
  const seen = new Set<string>();
  for (const card of cards) {
    const linkRe = /<a href="(\/movie\/[^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
    let titleMatch: RegExpExecArray | null;
    let title = "";
    let moviePath = "";
    while ((titleMatch = linkRe.exec(card))) {
      const candidate = decodeHtml(titleMatch[2]);
      if (candidate) { title = candidate; moviePath = titleMatch[1]; break; }
    }
    if (!title || !moviePath) continue;
    const externalMovieId = slug(moviePath.replace(/^\/movie\//, "")) || slug(title);
    const movieFingerprint = `${source.source_id}:${externalMovieId}`;
    const sessionRe = /id="([^"]+)-session-slide-item"[\s\S]{0,700}?<div class="time[^"]*"[^>]*>[\s\S]*?<span>\s*([0-2]\d:[0-5]\d)\s*<\/span>[\s\S]{0,300}?<div class="text-neutral-100[^"]*"[^>]*>\s*([^<]+?)\s*<\/div>/gi;
    let match: RegExpExecArray | null;
    while ((match = sessionRe.exec(card))) {
      const sessionId = match[1];
      if (seen.has(sessionId)) continue;
      seen.add(sessionId);
      const localTime = match[2];
      const formatText = decodeHtml(match[3]);
      const local = `${projectionDate}T${localTime}:00`;
      try {
        const startsAt = zonedLocalToIso(local, source.timezone);
        const ticketUrl = new URL(moviePath, page.url).toString();
        const stable = [source.source_id, source.venue_id, sessionId, local].join("|");
        rows.push({
          external_screening_id: sessionId,
          screening_fingerprint: `sha256:${sha256(stable)}`,
          external_movie_id: externalMovieId,
          movie_fingerprint: movieFingerprint,
          title,
          original_title: null,
          release_year: null,
          duration_minutes: null,
          starts_at_local: local,
          starts_at: startsAt,
          timezone: source.timezone,
          audio_language: null,
          subtitle_languages: [],
          audio_type: null,
          version_type: null,
          format: formatText || null,
          auditorium: null,
          screening_tags: formatText ? [formatText] : [],
          ticket_url: ticketUrl,
          source_url: page.url,
          raw_language: null,
          raw_version: formatText || null,
        });
      } catch (error) {
        rejected += 1;
        errors.push(`screening_parse_failed:${sessionId}:${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  }
  return { rows, errors, rejected };
};

export const planetaKinoUaAdapter: CinemaAdapter = {
  key: "planeta_kino_ua",
  async fetchSnapshot(source) {
    const fetchedAt = new Date().toISOString();
    try {
      const page = await fetchText(source.source_url);
      return { adapter_key: this.key, fetched_at: fetchedAt, root_url: source.source_url, pages: [page], failures: [] };
    } catch (error) {
      return {
        adapter_key: this.key, fetched_at: fetchedAt, root_url: source.source_url, pages: [],
        failures: [{ url: source.source_url, error: error instanceof Error ? error.message : "fetch_failed" }],
      };
    }
  },
  parseSnapshot(source, payload): CinemaParseResult {
    const errors = payload.failures.map((failure) => `fetch_failed:${failure.url}:${failure.error}`);
    const rows: CinemaNormalizedScreening[] = [];
    let rejected = 0;
    for (const page of payload.pages) {
      const parsed = parsePlanetaKinoPage(source, page, payload.fetched_at);
      rows.push(...parsed.rows); errors.push(...parsed.errors); rejected += parsed.rejected;
    }
    const unique = new Map<string, CinemaNormalizedScreening>();
    for (const row of rows) unique.set(row.external_screening_id || row.screening_fingerprint, row);
    const normalized = [...unique.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title));
    const dates = normalized.map((row) => row.starts_at_local.slice(0, 10)).sort();
    const fetchedLocalDate = localDateInZone(payload.fetched_at, source.timezone);
    const expectedUntil = addDays(fetchedLocalDate, Math.max(0, source.expected_horizon_days - 1));
    const maxDate = dates.at(-1) || null;
    const fetchComplete = payload.pages.length > 0 && payload.failures.length === 0;
    const parserComplete = !errors.some((error) => /schedule_cards_missing|challenge_response|projection_date_missing|screening_parse_failed/.test(error));
    const recordsValid = normalized.length;
    const zeroResult = recordsValid === 0;
    const scopeComplete = fetchComplete && parserComplete && !zeroResult && recordsValid >= source.min_records && maxDate !== null && maxDate >= expectedUntil;
    return {
      rows: normalized, records_parsed: recordsValid + rejected, records_valid: recordsValid, records_rejected: rejected,
      min_schedule_date: dates[0] || null, max_schedule_date: maxDate, expected_until: expectedUntil,
      fetch_complete: fetchComplete, parser_complete: parserComplete, scope_complete: scopeComplete,
      fatal_error: false, zero_result: zeroResult, errors,
      metrics: { fetched_pages: payload.pages.length, fetch_failures: payload.failures.length, unique_screenings: recordsValid },
    };
  },
};
