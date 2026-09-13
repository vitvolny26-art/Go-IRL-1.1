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
    .replace(/<(?:br|\/p|\/div|\/li|\/td|\/th|\/h\d)>/gi, " ")
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

const extractMovieUrls = (html: string, base: string) => {
  const origin = new URL(base).origin;
  const urls = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(re)) {
    const url = safeUrl(match[1], base);
    if (!url) continue;
    const parsed = new URL(url);
    if (parsed.origin !== origin || !/^\/filmy\/[^/?#]+\/?$/.test(parsed.pathname)) continue;
    urls.add(`${parsed.origin}${parsed.pathname.endsWith("/") ? parsed.pathname : `${parsed.pathname}/`}`);
  }
  return [...urls].sort();
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
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(v.year), Number(v.month) - 1, Number(v.day), Number(v.hour), Number(v.minute), Number(v.second));
  return asUtc - instant.getTime();
};

const zonedLocalToIso = (local: string, timeZone: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00$/.exec(local);
  if (!match) throw new Error("invalid_local_datetime");
  const [, y, m, d, hh, mm] = match;
  const guess = Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm));
  let offset = zoneOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset;
  const corrected = zoneOffsetMs(new Date(utc), timeZone);
  if (corrected !== offset) {
    offset = corrected;
    utc = guess - offset;
  }
  return new Date(utc).toISOString();
};

const czechMonths: Record<string, number> = {
  ledna: 1, unora: 2, února: 2, brezna: 3, března: 3, dubna: 4, kvetna: 5, května: 5,
  cervna: 6, června: 6, cervence: 7, července: 7, srpna: 8, zari: 9, září: 9,
  rijna: 10, října: 10, listopadu: 11, prosince: 12,
};

const parseProjectionDate = (text: string, fetchedLocalDate: string) => {
  const numeric = /(\d{1,2})\.\s*(\d{1,2})\./.exec(text);
  const named = /(\d{1,2})\.\s*([A-Za-zÀ-ž]+)/.exec(text);
  const day = Number(numeric?.[1] ?? named?.[1]);
  const month = numeric ? Number(numeric[2]) : czechMonths[(named?.[2] || "").toLowerCase()];
  if (!day || !month || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const currentYear = Number(fetchedLocalDate.slice(0, 4));
  const currentMonth = Number(fetchedLocalDate.slice(5, 7));
  const year = month < currentMonth - 6 ? currentYear + 1 : month > currentMonth + 6 ? currentYear - 1 : currentYear;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const cellsFromRow = (rowHtml: string) => [...rowHtml.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
  .map((match) => ({ html: match[1], text: textFromHtml(match[1]) }));

const timeLinks = (html: string, base: string) => {
  const output: Array<{ time: string; url: string | null }> = [];
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const text = textFromHtml(match[2]);
    const time = /\b([01]?\d|2[0-3]):[0-5]\d\b/.exec(text)?.[0];
    if (time) output.push({ time: time.padStart(5, "0"), url: safeUrl(match[1], base) });
  }
  if (output.length) return output;
  const seen = new Set<string>();
  for (const match of textFromHtml(html).matchAll(/\b([01]?\d|2[0-3]):[0-5]\d\b/g)) {
    const time = match[0].padStart(5, "0");
    if (!seen.has(time)) { seen.add(time); output.push({ time, url: null }); }
  }
  return output;
};

const movieSlug = (url: string) => /\/filmy\/([^/?#]+)\/?/.exec(new URL(url).pathname)?.[1] || "";

const extractScreeningId = (url: string | null) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    for (const key of ["screeningId", "performanceId", "eventId", "showId", "id"]) {
      const value = parsed.searchParams.get(key);
      if (value && /^\d+$/.test(value)) return value;
    }
    const tail = /(?:^|[/=_-])(\d{5,})(?:\D*$)/.exec(`${parsed.pathname}${parsed.search}`)?.[1];
    return tail || null;
  } catch { return null; }
};

const extractTitle = (html: string) => {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  return h1 ? textFromHtml(h1) : null;
};

const extractYearDuration = (html: string) => {
  const text = textFromHtml(html);
  const match = /\b(20\d{2})\b(?:\s*,\s*(\d{2,3})\s*min\.?\b)?/.exec(text);
  return {
    releaseYear: match ? Number(match[1]) : null,
    durationMinutes: match?.[2] ? Number(match[2]) : null,
  };
};

const languageFields = (raw: string | null) => {
  const value = raw?.trim().toLowerCase() || "";
  if (value === "cz" || value === "cs") return { audio_language: "cs", subtitle_languages: [] as string[], version_type: "cz" };
  if (value === "tit") return { audio_language: null, subtitle_languages: ["cs"], version_type: "subtitled" };
  if (value === "orig") return { audio_language: null, subtitle_languages: [] as string[], version_type: "original" };
  return { audio_language: null, subtitle_languages: [] as string[], version_type: value || null };
};

const formatFields = (text: string) => {
  const upper = text.toUpperCase();
  const tags = ["D-BOX", "VIP", "3D", "4K", "DOLBY ATMOS", "7.1"].filter((tag) => upper.includes(tag));
  const format = tags.includes("3D") ? "3D" : tags.includes("4K") ? "4K" : "2D";
  return { tags, format, audioType: tags.includes("DOLBY ATMOS") ? "Dolby Atmos" : tags.includes("7.1") ? "7.1" : null };
};

const parseMoviePage = (
  source: CinemaSourceConfig,
  page: CinemaFetchedPage,
  fetchedLocalDate: string,
) => {
  const rows: CinemaNormalizedScreening[] = [];
  const errors: string[] = [];
  let rejected = 0;
  const title = extractTitle(page.body);
  const slug = movieSlug(page.url);
  if (!title || !slug) return { rows, errors: [`movie_identity_missing:${page.url}`], rejected: 0 };
  const { releaseYear, durationMinutes } = extractYearDuration(page.body);
  const movieFingerprint = `${source.source_id}:${slug}:${releaseYear ?? "unknown"}`;

  for (const tr of page.body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = cellsFromRow(tr[1]);
    if (cells.length < 4) continue;
    const projectionDate = parseProjectionDate(cells[0].text, fetchedLocalDate);
    if (!projectionDate) continue;
    const rawLanguage = cells[2]?.text || null;
    const rawVersion = cells[3]?.text || null;
    const links = timeLinks(cells.slice(4).map((c) => c.html).join(" ") || tr[1], page.url);
    if (!links.length) continue;

    for (const link of links) {
      try {
        const local = `${projectionDate}T${link.time}:00`;
        const startsAt = zonedLocalToIso(local, source.timezone);
        const language = languageFields(rawLanguage);
        const formatInfo = formatFields(`${title} ${rawVersion || ""} ${tr[1]}`);
        const externalId = extractScreeningId(link.url);
        const stable = [source.source_id, slug, local, rawLanguage || "", rawVersion || "", formatInfo.tags.join(",")].join("|");
        rows.push({
          external_screening_id: externalId,
          screening_fingerprint: `sha256:${sha256(stable)}`,
          external_movie_id: slug,
          movie_fingerprint: movieFingerprint,
          title,
          original_title: null,
          release_year: releaseYear,
          duration_minutes: durationMinutes,
          starts_at_local: local,
          starts_at: startsAt,
          timezone: source.timezone,
          audio_language: language.audio_language,
          subtitle_languages: language.subtitle_languages,
          audio_type: formatInfo.audioType,
          version_type: language.version_type,
          format: formatInfo.format,
          auditorium: formatInfo.tags.includes("VIP") ? "VIP" : formatInfo.tags.includes("D-BOX") ? "D-BOX" : null,
          screening_tags: formatInfo.tags,
          ticket_url: link.url,
          source_url: page.url,
          raw_language: rawLanguage,
          raw_version: rawVersion,
        });
      } catch (error) {
        rejected += 1;
        errors.push(`screening_parse_failed:${slug}:${projectionDate}:${link.time}:${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  }
  return { rows, errors, rejected };
};

const premiereAdapter: CinemaAdapter = {
  key: "premiere_cz",

  async fetchSnapshot(source) {
    const fetchedAt = new Date().toISOString();
    const indexUrl = new URL("filmy/", source.source_url).toString();
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

    const movieUrls = extractMovieUrls(index.body, index.url);
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
      if (!/\/filmy\/[^/?#]+\/?$/.test(new URL(page.url).pathname)) continue;
      const parsed = parseMoviePage(source, page, fetchedLocalDate);
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
    const fetchComplete = payload.pages.length > 0 && payload.failures.length === 0;
    const zeroResult = normalized.length === 0;
    const parserComplete = errors.filter((e) => e.startsWith("movie_identity_missing") || e.startsWith("screening_parse_failed")).length === 0;
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
        unique_screenings: recordsValid,
        movie_pages: payload.pages.filter((page) => /\/filmy\/[^/?#]+\/?$/.test(new URL(page.url).pathname)).length,
      },
    };
  },
};

export const cinemaAdapters: Record<string, CinemaAdapter> = {
  [premiereAdapter.key]: premiereAdapter,
};

export const getCinemaAdapter = (key: string) => {
  const adapter = cinemaAdapters[key];
  if (!adapter) throw new Error(`cinema_adapter_unknown:${key}`);
  return adapter;
};

export const premiereCzAdapter = premiereAdapter;
