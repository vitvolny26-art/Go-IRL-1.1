import { createHash } from "node:crypto";
import type {
  CinemaAdapter,
  CinemaFetchedPage,
  CinemaNormalizedScreening,
  CinemaParseResult,
  CinemaRawSnapshotPayload,
  CinemaSourceConfig,
} from "../cinema-ingestion-types.js";

const userAgent = "GO-IRL-Cinema-Ingestion/2.0 (+schedule archival; contact via GO IRL)";
const requestTimeoutMs = 20_000;
const movieConcurrency = 6;

const entityMap: Record<string, string> = {
  amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ",
};

const decodeEntities = (value: string) => value
  .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (whole, name: string) => entityMap[name.toLowerCase()] ?? whole);

const textFromHtml = (html: string) => decodeEntities(
  html
    .replace(/<img\b[^>]*(?:alt|title)=["']([^"']*)["'][^>]*>/gi, " $1 ")
    .replace(/<(?:br|\/p|\/div|\/li|\/td|\/th|\/h\d|\/button|\/a)>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "),
).replace(/\s+/g, " ").trim();

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const safeUrl = (href: string, base: string) => {
  try { return new URL(decodeEntities(href), base).toString(); } catch { return null; }
};

const fetchText = async (url: string): Promise<CinemaFetchedPage> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`http_${response.status}`);
    if (!body.trim()) throw new Error("empty_body");
    return { url: response.url || url, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
};

const mapConcurrent = async <T, R>(values: T[], concurrency: number, fn: (value: T) => Promise<R>) => {
  const results: Array<PromiseSettledResult<R>> = new Array(values.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try { results[index] = { status: "fulfilled", value: await fn(values[index]) }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return results;
};

const discoverMovieUrls = (html: string, base: string) => {
  const baseUrl = new URL(base);
  const urls = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const url = safeUrl(match[1], base);
    if (!url) continue;
    const parsed = new URL(url);
    if (parsed.origin !== baseUrl.origin) continue;
    if (!/^\/cz\/[^/]+\/filmy\/movie\/\d+-[^/?#]+\/?$/.test(parsed.pathname)) continue;
    urls.add(`${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`);
  }
  return [...urls].sort();
};

const movieIdentity = (url: string) => {
  const match = /\/filmy\/movie\/(\d+)-([^/?#]+)/.exec(new URL(url).pathname);
  return match ? { id: match[1], slug: match[2] } : null;
};

const cleanSourceTitle = (value: string) => value
  .replace(/\s+(?:DABING|TITULKY|ORIG(?:INÁL)?|CZ)\s*$/i, "")
  .trim();

const extractTitle = (html: string) => {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  return h1 ? cleanSourceTitle(textFromHtml(h1)) : null;
};

const extractDuration = (html: string) => {
  const match = /\b(\d{2,3})\s*min\.?\b/i.exec(textFromHtml(html));
  return match ? Number(match[1]) : null;
};

const extractReleaseYear = (html: string) => {
  const explicit = /(?:rok|year|premi[eé]ra)[^0-9]{0,20}\b(20\d{2})\b/i.exec(textFromHtml(html));
  return explicit ? Number(explicit[1]) : null;
};

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
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(
    Number(value.year), Number(value.month) - 1, Number(value.day),
    Number(value.hour), Number(value.minute), Number(value.second),
  ) - instant.getTime();
};

const zonedLocalToIso = (local: string, timeZone: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00$/.exec(local);
  if (!match) throw new Error("invalid_local_datetime");
  const [, y, m, d, hh, mm] = match;
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm));
  let offset = zoneOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset;
  const corrected = zoneOffsetMs(new Date(utc), timeZone);
  if (corrected !== offset) utc = guess - corrected;
  return new Date(utc).toISOString();
};

type ScheduleEvent =
  | { index: number; priority: number; kind: "date"; value: string }
  | { index: number; priority: number; kind: "auditorium"; value: string }
  | { index: number; priority: number; kind: "language"; value: string }
  | { index: number; priority: number; kind: "tag"; value: string }
  | { index: number; priority: number; kind: "action"; time: string; href: string | null; markup: string };

const dateEvents = (html: string): ScheduleEvent[] => {
  const output: ScheduleEvent[] = [];
  for (const match of html.matchAll(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})\b/g)) {
    output.push({
      index: match.index ?? 0,
      priority: 0,
      kind: "date",
      value: `${match[3]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`,
    });
  }
  return output;
};

const semanticMarker = (index: number, rawText: string): ScheduleEvent[] => {
  const text = decodeEntities(rawText).replace(/\s+/g, " ").trim();
  if (!text) return [];
  const upper = text.toUpperCase();
  const output: ScheduleEvent[] = [];

  const auditorium = /\b(MINI KINO|PREMIUM|STANDARD)\b/.exec(upper)?.[1];
  if (auditorium) output.push({ index, priority: 1, kind: "auditorium", value: auditorium });

  if (/\bUA\s*ZN[EĚ]N[IÍ]\b/.test(upper)) {
    output.push({ index, priority: 2, kind: "language", value: "UA znění" });
  } else if (/\bTITULKY\b/.test(upper)) {
    output.push({ index, priority: 2, kind: "language", value: "Titulky" });
  } else if (/\bDABING\b/.test(upper)) {
    output.push({ index, priority: 2, kind: "language", value: "Dabing" });
  } else if (/^CZ$/.test(upper)) {
    output.push({ index, priority: 2, kind: "language", value: "CZ" });
  }

  for (const tag of ["DOLBY ATMOS", "7.1", "4K", "3D"] as const) {
    if (upper.includes(tag)) output.push({ index, priority: 3, kind: "tag", value: tag });
  }
  return output;
};

const semanticEvents = (html: string): ScheduleEvent[] => {
  const output: ScheduleEvent[] = [];

  for (const match of html.matchAll(/>([^<>]{1,120})</g)) {
    output.push(...semanticMarker((match.index ?? 0) + 1, match[1]));
  }
  for (const match of html.matchAll(/<img\b[^>]*(?:alt|title)=["']([^"']{1,120})["'][^>]*>/gi)) {
    output.push(...semanticMarker(match.index ?? 0, match[1]));
  }
  return output;
};

const actionEvents = (html: string, base: string): ScheduleEvent[] => {
  const output: ScheduleEvent[] = [];
  for (const match of html.matchAll(/<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const time = /\b([01]?\d|2[0-3]):[0-5]\d\b/.exec(textFromHtml(match[3]))?.[0];
    if (!time) continue;
    const hrefRaw = /\bhref=["']([^"']+)["']/i.exec(match[2])?.[1] || null;
    output.push({
      index: match.index ?? 0,
      priority: 10,
      kind: "action",
      time: time.padStart(5, "0"),
      href: hrefRaw ? safeUrl(hrefRaw, base) : null,
      markup: match[0],
    });
  }
  return output;
};

const languageFields = (raw: string | null) => {
  const upper = raw?.toUpperCase() || "";
  if (upper === "DABING") return { audio: "cs", subtitles: [] as string[], version: "dubbed" };
  if (upper === "TITULKY") return { audio: null, subtitles: ["cs"], version: "subtitled" };
  if (upper === "CZ") return { audio: "cs", subtitles: [] as string[], version: "cz" };
  if (upper.startsWith("UA")) return { audio: "uk", subtitles: [] as string[], version: "original" };
  return { audio: null, subtitles: [] as string[], version: null };
};

const screeningIdFromMarkup = (markup: string, href: string | null) => {
  for (const pattern of [
    /data-(?:screening|performance|show|event)-id=["'](\d{4,})["']/i,
    /(?:screening|performance|show|event)[-_]?(?:id)?=["']?(\d{4,})/i,
  ]) {
    const match = pattern.exec(markup);
    if (match) return match[1];
  }
  if (href) {
    try {
      const url = new URL(href);
      for (const key of ["screeningId", "performanceId", "showId", "eventId", "id"]) {
        const value = url.searchParams.get(key);
        if (value && /^\d{4,}$/.test(value)) return value;
      }
    } catch { /* ignore malformed href */ }
  }
  return null;
};

const parseMoviePage = (source: CinemaSourceConfig, page: CinemaFetchedPage) => {
  const identity = movieIdentity(page.url);
  const title = extractTitle(page.body);
  const durationMinutes = extractDuration(page.body);
  const releaseYear = extractReleaseYear(page.body);
  const rows: CinemaNormalizedScreening[] = [];
  const errors: string[] = [];
  let rejected = 0;

  if (!identity || !title) return { rows, errors: [`movie_identity_missing:${page.url}`], rejected };

  const movieFingerprint = `${source.source_id}:${identity.id}:${releaseYear ?? "unknown"}`;
  const events = [
    ...dateEvents(page.body),
    ...semanticEvents(page.body),
    ...actionEvents(page.body, page.url),
  ].sort((left, right) => left.index - right.index || left.priority - right.priority);

  let currentDate: string | null = null;
  let auditorium: string | null = null;
  let rawLanguage: string | null = null;
  let tags = new Set<string>();

  for (const event of events) {
    if (event.kind === "date") {
      currentDate = event.value;
      auditorium = null;
      rawLanguage = null;
      tags = new Set<string>();
      continue;
    }
    if (!currentDate) continue;
    if (event.kind === "auditorium") {
      auditorium = event.value;
      rawLanguage = null;
      tags = new Set<string>();
      continue;
    }
    if (event.kind === "language") {
      rawLanguage = event.value;
      continue;
    }
    if (event.kind === "tag") {
      tags.add(event.value);
      continue;
    }

    try {
      const local = `${currentDate}T${event.time}:00`;
      const startsAt = zonedLocalToIso(local, source.timezone);
      const language = languageFields(rawLanguage);
      const format = tags.has("3D") ? "3D" : tags.has("4K") ? "4K" : "2D";
      const audioType = tags.has("DOLBY ATMOS") ? "Dolby Atmos" : tags.has("7.1") ? "7.1" : null;
      const externalId = screeningIdFromMarkup(event.markup, event.href);
      const stable = [
        source.source_id, identity.id, local, auditorium || "", rawLanguage || "", format, audioType || "",
      ].join("|");
      rows.push({
        external_screening_id: externalId,
        screening_fingerprint: `sha256:${sha256(stable)}`,
        external_movie_id: identity.id,
        movie_fingerprint: movieFingerprint,
        title,
        original_title: null,
        release_year: releaseYear,
        duration_minutes: durationMinutes,
        starts_at_local: local,
        starts_at: startsAt,
        timezone: source.timezone,
        audio_language: language.audio,
        subtitle_languages: language.subtitles,
        audio_type: audioType,
        version_type: language.version,
        format,
        auditorium,
        screening_tags: [...new Set([...(auditorium ? [auditorium] : []), ...tags])],
        ticket_url: event.href,
        source_url: page.url,
        raw_language: rawLanguage,
        raw_version: [auditorium, ...tags].filter(Boolean).join(" ") || null,
      });
    } catch (error) {
      rejected += 1;
      errors.push(`screening_parse_failed:${identity.id}:${currentDate}:${event.time}:${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return { rows, errors, rejected };
};

const cineStarAdapter: CinemaAdapter = {
  key: "cinestar_cz",

  async fetchSnapshot(source) {
    const fetchedAt = new Date().toISOString();
    const root = source.source_url.endsWith("/") ? source.source_url : `${source.source_url}/`;
    const indexUrl = new URL("filmy", root).toString();
    const pages: CinemaFetchedPage[] = [];
    const failures: Array<{ url: string; error: string }> = [];

    let index: CinemaFetchedPage;
    try {
      index = await fetchText(indexUrl);
      pages.push(index);
    } catch (error) {
      return {
        adapter_key: this.key,
        fetched_at: fetchedAt,
        root_url: indexUrl,
        pages,
        failures: [{ url: indexUrl, error: error instanceof Error ? error.message : "fetch_failed" }],
      };
    }

    const movieUrls = discoverMovieUrls(index.body, index.url);
    if (!movieUrls.length) {
      failures.push({ url: index.url, error: "movie_index_empty" });
      return { adapter_key: this.key, fetched_at: fetchedAt, root_url: indexUrl, pages, failures };
    }

    const results = await mapConcurrent(movieUrls, movieConcurrency, fetchText);
    results.forEach((result, indexPosition) => {
      if (result.status === "fulfilled") pages.push(result.value);
      else failures.push({
        url: movieUrls[indexPosition],
        error: result.reason instanceof Error ? result.reason.message : "fetch_failed",
      });
    });

    return { adapter_key: this.key, fetched_at: fetchedAt, root_url: indexUrl, pages, failures };
  },

  parseSnapshot(source, payload): CinemaParseResult {
    const fetchedLocalDate = localDateInZone(payload.fetched_at, source.timezone);
    const expectedUntil = addDays(fetchedLocalDate, Math.max(0, source.expected_horizon_days - 1));
    const errors = payload.failures.map((failure) => `fetch_failed:${failure.url}:${failure.error}`);
    const rows: CinemaNormalizedScreening[] = [];
    let rejected = 0;

    for (const page of payload.pages.slice(1)) {
      const parsed = parseMoviePage(source, page);
      rows.push(...parsed.rows);
      errors.push(...parsed.errors);
      rejected += parsed.rejected;
    }

    const unique = new Map<string, CinemaNormalizedScreening>();
    for (const row of rows) {
      const key = row.external_screening_id
        ? `${source.source_id}:external:${row.external_screening_id}`
        : row.screening_fingerprint;
      if (!unique.has(key)) unique.set(key, row);
    }
    const normalized = [...unique.values()].sort(
      (left, right) => left.starts_at.localeCompare(right.starts_at) || left.title.localeCompare(right.title),
    );
    const dates = normalized.map((row) => row.starts_at_local.slice(0, 10)).sort();
    const maxDate = dates.at(-1) || null;
    const fetchComplete = payload.pages.length > 1 && payload.failures.length === 0;
    const zeroResult = normalized.length === 0;
    const parserComplete = errors.filter(
      (error) => error.startsWith("movie_identity_missing") || error.startsWith("screening_parse_failed"),
    ).length === 0;
    const recordsValid = normalized.length;
    const scopeComplete = fetchComplete
      && parserComplete
      && !zeroResult
      && recordsValid >= source.min_records
      && maxDate !== null
      && maxDate >= expectedUntil;

    return {
      rows: normalized,
      records_parsed: normalized.length + rejected,
      records_valid: recordsValid,
      records_rejected: rejected,
      min_schedule_date: dates[0] || null,
      max_schedule_date: maxDate,
      expected_until: expectedUntil,
      fetch_complete: fetchComplete,
      parser_complete: parserComplete,
      scope_complete: scopeComplete,
      fatal_error: false,
      zero_result: zeroResult,
      errors,
      metrics: {
        fetched_pages: payload.pages.length,
        fetch_failures: payload.failures.length,
        unique_screenings: normalized.length,
        rejected_screenings: rejected,
      },
    };
  },
};

export const cinestarCzAdapter = cineStarAdapter;
