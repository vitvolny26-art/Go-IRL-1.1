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

const extractTitle = (html: string) => {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  return h1 ? textFromHtml(h1) : null;
};

const extractDuration = (html: string) => {
  const text = textFromHtml(html);
  const match = /\b(\d{2,3})\s*min\.?\b/i.exec(text);
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
  const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
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
  const value = Object.fromEntries(parts.map((p) => [p.type, p.value]));
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

type DateMarker = { index: number; date: string };

const dateMarkers = (html: string) => {
  const output: DateMarker[] = [];
  for (const match of html.matchAll(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})\b/g)) {
    const index = match.index ?? 0;
    const day = String(Number(match[1])).padStart(2, "0");
    const month = String(Number(match[2])).padStart(2, "0");
    output.push({ index, date: `${match[3]}-${month}-${day}` });
  }
  return output;
};

const nearestDate = (markers: DateMarker[], index: number) => {
  let result: string | null = null;
  for (const marker of markers) {
    if (marker.index > index) break;
    result = marker.date;
  }
  return result;
};

const lastContextMatch = (text: string, pattern: RegExp) => {
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let value: string | null = null;
  for (const match of text.matchAll(global)) value = match[0];
  return value;
};

const auditoriumFromContext = (context: string) => {
  const value = lastContextMatch(textFromHtml(context).toUpperCase(), /\b(PREMIUM|STANDARD|MINI KINO)\b/g);
  return value || null;
};

const languageFromContext = (context: string) => {
  const text = textFromHtml(context);
  const upper = text.toUpperCase();
  const hasUa = /\bUA\s*ZN[EĚ]N[IÍ]\b/.test(upper);
  const hasTit = /\bTITULKY\b/.test(upper);
  const hasDabing = /\bDABING\b/.test(upper);
  const hasCz = /\bCZ\b/.test(upper);
  if (hasUa) return { raw: "UA znění", audio: "uk", subtitles: hasCz ? ["cs"] : [] as string[], version: "original" };
  if (hasTit) return { raw: "Titulky", audio: null, subtitles: ["cs"], version: "subtitled" };
  if (hasDabing) return { raw: "Dabing", audio: "cs", subtitles: [] as string[], version: "dubbed" };
  if (hasCz) return { raw: "CZ", audio: "cs", subtitles: [] as string[], version: "cz" };
  return { raw: null, audio: null, subtitles: [] as string[], version: null };
};

const presentationFromContext = (context: string) => {
  const text = textFromHtml(context).toUpperCase();
  const tags = ["4K", "3D", "7.1", "DOLBY ATMOS"].filter((tag) => text.includes(tag));
  return {
    tags,
    format: tags.includes("3D") ? "3D" : tags.includes("4K") ? "4K" : "2D",
    audioType: tags.includes("DOLBY ATMOS") ? "Dolby Atmos" : tags.includes("7.1") ? "7.1" : null,
  };
};

const screeningIdFromMarkup = (markup: string, href: string | null) => {
  const candidates = [
    /(?:screening|performance|show|event)[-_]?(?:id)?=["']?(\d{4,})/i,
    /data-(?:screening|performance|show|event)-id=["'](\d{4,})["']/i,
  ];
  for (const pattern of candidates) {
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

const actionableTimes = (html: string, base: string) => {
  const output: Array<{ index: number; time: string; href: string | null; markup: string }> = [];
  const pattern = /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  for (const match of html.matchAll(pattern)) {
    const time = /\b([01]?\d|2[0-3]):[0-5]\d\b/.exec(textFromHtml(match[3]))?.[0];
    if (!time) continue;
    const hrefRaw = /\bhref=["']([^"']+)["']/i.exec(match[2])?.[1] || null;
    output.push({
      index: match.index ?? 0,
      time: time.padStart(5, "0"),
      href: hrefRaw ? safeUrl(hrefRaw, base) : null,
      markup: match[0],
    });
  }
  return output;
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

  const markers = dateMarkers(page.body);
  const actions = actionableTimes(page.body, page.url);
  const movieFingerprint = `${source.source_id}:${identity.id}:${releaseYear ?? "unknown"}`;
  let previousDateStart = 0;

  for (const action of actions) {
    const projectionDate = nearestDate(markers, action.index);
    if (!projectionDate) continue;
    const marker = [...markers].reverse().find((candidate) => candidate.index <= action.index);
    const dateStart = marker?.index ?? previousDateStart;
    previousDateStart = dateStart;
    const context = page.body.slice(dateStart, action.index);
    const boundedContext = context.slice(-6000);
    const auditorium = auditoriumFromContext(boundedContext);
    const language = languageFromContext(boundedContext);
    const presentation = presentationFromContext(boundedContext);

    try {
      const local = `${projectionDate}T${action.time}:00`;
      const startsAt = zonedLocalToIso(local, source.timezone);
      const externalId = screeningIdFromMarkup(action.markup, action.href);
      const stable = [
        source.source_id, identity.id, local, auditorium || "", language.raw || "",
        presentation.format, presentation.audioType || "",
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
        audio_type: presentation.audioType,
        version_type: language.version,
        format: presentation.format,
        auditorium,
        screening_tags: [...new Set([...(auditorium ? [auditorium] : []), ...presentation.tags])],
        ticket_url: action.href,
        source_url: page.url,
        raw_language: language.raw,
        raw_version: [auditorium, ...presentation.tags].filter(Boolean).join(" ") || null,
      });
    } catch (error) {
      rejected += 1;
      errors.push(`screening_parse_failed:${identity.id}:${projectionDate}:${action.time}:${error instanceof Error ? error.message : "unknown"}`);
    }
  }

  return { rows, errors, rejected };
};

const cineStarAdapter: CinemaAdapter = {
  key: "cinestar_cz",

  async fetchSnapshot(source) {
    const fetchedAt = new Date().toISOString();
    const indexUrl = new URL("filmy", source.source_url.endsWith("/") ? source.source_url : `${source.source_url}/`).toString();
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
      failures.push({ url: index.url, error: "movie_discovery_zero" });
      return { adapter_key: this.key, fetched_at: fetchedAt, root_url: indexUrl, pages, failures };
    }

    const fetched = await mapConcurrent(movieUrls, movieConcurrency, fetchText);
    fetched.forEach((result, indexNo) => {
      if (result.status === "fulfilled") pages.push(result.value);
      else failures.push({
        url: movieUrls[indexNo],
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

    for (const page of payload.pages) {
      if (!/\/filmy\/movie\/\d+-[^/?#]+\/?$/.test(new URL(page.url).pathname)) continue;
      const parsed = parseMoviePage(source, page);
      rows.push(...parsed.rows);
      errors.push(...parsed.errors);
      rejected += parsed.rejected;
    }

    const unique = new Map<string, CinemaNormalizedScreening>();
    for (const row of rows) {
      const key = row.external_screening_id
        ? `external:${source.source_id}:${row.external_screening_id}`
        : `fingerprint:${row.screening_fingerprint}`;
      if (!unique.has(key)) unique.set(key, row);
    }
    const normalized = [...unique.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title));
    const dates = normalized.map((row) => row.starts_at_local.slice(0, 10)).sort();
    const maxDate = dates.at(-1) || null;
    const fetchComplete = payload.pages.length > 1 && payload.failures.length === 0;
    const zeroResult = normalized.length === 0;
    const parserComplete = errors.filter((error) => error.startsWith("movie_identity_missing") || error.startsWith("screening_parse_failed")).length === 0;
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
        movie_pages: payload.pages.filter((page) => /\/filmy\/movie\/\d+-[^/?#]+\/?$/.test(new URL(page.url).pathname)).length,
        actionable_screenings: recordsValid,
      },
    };
  },
};

export const cinestarCzAdapter = cineStarAdapter;
