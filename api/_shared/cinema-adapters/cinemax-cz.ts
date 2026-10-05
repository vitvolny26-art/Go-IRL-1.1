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

const decodeEntities = (value: string) => value
  .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">");

const textFromHtml = (html: string) => decodeEntities(
  html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/td|\/th|\/h\d|\/button|\/a)>/gi, "\n")
    .replace(/<[^>]+>/g, " "),
).replace(/[ \t]+/g, " ").replace(/\n+/g, "\n").trim();

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const fetchText = async (url: string): Promise<CinemaFetchedPage> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`http_${response.status}`);
    if (!body.trim()) throw new Error("empty_body");
    return { url: response.url || url, status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
};

const fetchForm = async (url: string, body: URLSearchParams): Promise<CinemaFetchedPage> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": userAgent,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "sk-SK,sk;q=0.9,en;q=0.5",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
      },
      body,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`http_${response.status}`);
    if (!text.trim()) throw new Error("empty_body");
    return { url: response.url || url, status: response.status, body: text };
  } finally {
    clearTimeout(timer);
  }
};

const isCinemaxSk = (url: string) => new URL(url).hostname.toLowerCase().endsWith("cine-max.sk");
const skDate = (isoDate: string) => {
  const [, y, m, d] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate) ?? [];
  return y ? `${d}.${m}.${y}` : isoDate;
};
const cinemaxSkCinemaUid = (html: string, source: CinemaSourceConfig) => {
  const configured = String(source.config?.cinema_uid ?? "").trim();
  if (configured) return configured;
  const query = new URL(source.source_url).searchParams.get("tx_cinemax_cine[city]");
  if (query) return query;
  if (/bratislava/i.test(source.source_id)) {
    const match = /data-value=["'](\d+)["'][^>]*data-type1=["']kinoLabel["'][^>]*data-value1=["'][^"']*Bratislava[^"']*["']/i.exec(html)
      ?? /data-value1=["'][^"']*Bratislava[^"']*["'][^>]*data-value=["'](\d+)["']/i.exec(html)
      ?? /tx_cinemax_cine%5Bcity%5D=(\d+)[^"'<>]*["'][^>]*>\s*Bratislava/i.exec(html);
    if (match) return match[1];
  }
  return null;
};
const parseCinemaxSkPage = (source: CinemaSourceConfig, date: string, page: CinemaFetchedPage) => {
  const rows: CinemaNormalizedScreening[] = [];
  const errors: string[] = [];
  let rejected = 0;
  const chunks = page.body.split(/<!--\s*List Item[^>]*-->/i).filter((chunk) => /class=["']list-item(?:\s|["'])/i.test(chunk));
  for (const chunk of chunks) {
    const film = /href=["'](\/filmy\/film\/([^"'?#]+))["']/i.exec(chunk);
    const titleMatch = /<span class=["']h1["']>\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
    if (!film || !titleMatch) continue;
    const externalMovieId = film[2].trim();
    const title = textFromHtml(titleMatch[1]).trim();
    const versionText = textFromHtml(/<span class=["']typ["']>([\s\S]*?)<\/span>/i.exec(chunk)?.[1] ?? "").trim();
    const low = versionText.toLowerCase();
    const duration = Number(/<li>\s*(\d{2,3})\s*min\s*<\/li>/i.exec(chunk)?.[1] ?? 0) || null;
    const ageRating = textFromHtml(/<span class=["']vek["']>\s*([^<]+)/i.exec(chunk)?.[1] ?? "").trim() || null;
    const format = /\b3d\b/i.test(versionText) ? "3D" : "2D";
    const audioLanguage = /slovensk.{0,3}\s+dabing/i.test(low) ? "sk" : /česk.{0,3}\s+dabing/i.test(low) ? "cs" : null;
    const subtitleLanguages = [
      ...(/slovensk.{0,3}\s+titul/i.test(low) ? ["sk"] : []),
      ...(/česk.{0,3}\s+titul/i.test(low) ? ["cs"] : []),
    ];
    const versionType = /dabing/i.test(low) ? "dubbed" : /titul/i.test(low) ? "subtitled" : null;
    const timeItems = [...chunk.matchAll(/<li class=["'][^"']*time-index-[^"']*["']>([\s\S]*?)<\/li>/gi)];
    for (const item of timeItems) {
      const time = /<span class=["']time["']>\s*(\d{1,2}:\d{2})\s*<\/span>/i.exec(item[1])?.[1];
      if (!time) continue;
      const href = /href=["']([^"']+)["']/i.exec(item[1])?.[1] ?? null;
      const eventId = href ? /(?:\/|=)(\d{3,})(?:[/?&#]|$)/.exec(href)?.[1] ?? null : null;
      try {
        const local = `${date}T${time.padStart(5, "0")}:00`;
        const stable = eventId ? `${source.source_id}:${eventId}` : [source.source_id, externalMovieId, local, format, versionText].join("|");
        rows.push({
          external_screening_id: eventId,
          screening_fingerprint: `sha256:${sha256(stable)}`,
          external_movie_id: externalMovieId,
          movie_fingerprint: `${source.source_id}:${externalMovieId}:unknown`,
          title,
          original_title: null,
          release_year: null,
          duration_minutes: duration,
          starts_at_local: local,
          starts_at: zonedLocalToIso(local, source.timezone),
          timezone: source.timezone,
          audio_language: audioLanguage,
          subtitle_languages: subtitleLanguages,
          audio_type: null,
          version_type: versionType,
          format,
          auditorium: null,
          screening_tags: [format],
          ticket_url: href ? new URL(href, page.url).toString() : null,
          source_url: new URL(film[1], source.source_url).toString(),
          raw_language: versionText || null,
          raw_version: versionText || null,
          genres: [],
          poster_url: null,
          age_rating: ageRating,
        });
      } catch (error) {
        rejected += 1;
        errors.push(`screening_parse_failed:${externalMovieId}:${date}:${time}:${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  }
  if (!chunks.length) errors.push("schedule_sections_missing");
  if (chunks.length && !rows.length) errors.push("screening_times_missing");
  return { rows, errors, rejected, dates: rows.length ? [date] : [] as string[] };
};

const monthNumber: Record<string, string> = {
  january: "01", february: "02", march: "03", april: "04", may: "05", june: "06",
  july: "07", august: "08", september: "09", october: "10", november: "11", december: "12",
};

const normalizeDate = (day: string, month: string, year: string) => {
  const mm = monthNumber[month.toLowerCase()];
  return mm ? `${year}-${mm}-${day.padStart(2, "0")}` : null;
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
  const offset = zoneOffsetMs(new Date(guess), timeZone);
  let utc = guess - offset;
  const corrected = zoneOffsetMs(new Date(utc), timeZone);
  if (corrected !== offset) utc = guess - corrected;
  return new Date(utc).toISOString();
};

const movieIdFromHref = (href: string) => /\/movies\/(\d+)\/?/.exec(href)?.[1] ?? null;

const scheduleSections = (html: string) => {
  const heading = /<h2\b[^>]*>\s*Cinemax Olympia Olomouc schedule in Olomouc on\s+(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\s*<\/h2>/gi;
  const matches = [...html.matchAll(heading)];
  return matches.map((match, index) => ({
    date: normalizeDate(match[1], match[2], match[3]),
    body: html.slice((match.index ?? 0) + match[0].length, matches[index + 1]?.index ?? html.length),
  }));
};

const movieAnchors = (html: string) => [...html.matchAll(/<a\b[^>]*href=["']([^"']*\/movies\/\d+\/?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)];

const movieGroups = (html: string) => {
  const anchors = movieAnchors(html);
  const groups: Array<{ href: string; titleHtml: string; block: string }> = [];
  let cursor = 0;
  while (cursor < anchors.length) {
    const first = anchors[cursor];
    const movieId = movieIdFromHref(first[1]);
    let endCursor = cursor + 1;
    const titleCandidates = [first[2]];
    while (endCursor < anchors.length && movieIdFromHref(anchors[endCursor][1]) === movieId) {
      titleCandidates.push(anchors[endCursor][2]);
      endCursor += 1;
    }
    const nextIndex = anchors[endCursor]?.index ?? html.length;
    const titleHtml = titleCandidates
      .map((candidate) => ({ candidate, text: textFromHtml(candidate).trim() }))
      .sort((left, right) => right.text.length - left.text.length)[0]?.candidate ?? first[2];
    groups.push({
      href: first[1],
      titleHtml,
      block: html.slice(first.index ?? 0, nextIndex),
    });
    cursor = endCursor;
  }
  return groups;
};

const parseMovieBlock = (source: CinemaSourceConfig, date: string, href: string, titleHtml: string, block: string) => {
  const rows: CinemaNormalizedScreening[] = [];
  const errors: string[] = [];
  let rejected = 0;
  const externalMovieId = movieIdFromHref(href);
  const title = textFromHtml(titleHtml).trim();
  if (!externalMovieId || !title) return { rows, errors: ["movie_identity_missing"], rejected: 1 };

  const blockText = textFromHtml(block);
  const year = /\b(20\d{2}|19\d{2})\b/.exec(blockText)?.[1] ?? null;
  const releaseYear = year ? Number(year) : null;
  const movieFingerprint = `${source.source_id}:${externalMovieId}:${releaseYear ?? "unknown"}`;

  const formatLines = [...blockText.matchAll(/\b(2D|3D)(?:\s*,\s*([A-Z]{2,4}))?\b/g)];
  if (!formatLines.length) return { rows, errors: [`format_missing:${externalMovieId}`], rejected: 1 };

  for (let i = 0; i < formatLines.length; i += 1) {
    const current = formatLines[i];
    const start = (current.index ?? 0) + current[0].length;
    const end = formatLines[i + 1]?.index ?? blockText.length;
    const timeArea = blockText.slice(start, end);
    const times = [...timeArea.matchAll(/\b([01]\d|2[0-3]):([0-5]\d)\b/g)].map((m) => `${m[1]}:${m[2]}`);
    for (const time of times) {
      try {
        const local = `${date}T${time}:00`;
        const format = current[1].toUpperCase();
        const language = current[2]?.toUpperCase() ?? null;
        const stable = [source.source_id, externalMovieId, local, format, language ?? ""].join("|");
        rows.push({
          external_screening_id: null,
          screening_fingerprint: `sha256:${sha256(stable)}`,
          external_movie_id: externalMovieId,
          movie_fingerprint: movieFingerprint,
          title,
          original_title: null,
          release_year: releaseYear,
          duration_minutes: null,
          starts_at_local: local,
          starts_at: zonedLocalToIso(local, source.timezone),
          timezone: source.timezone,
          audio_language: language === "CZ" ? "cs" : null,
          subtitle_languages: language === "SUB" ? ["cs"] : [],
          audio_type: null,
          version_type: language === "CZ" ? "cz" : language === "SUB" ? "subtitled" : null,
          format,
          auditorium: null,
          screening_tags: [format, ...(language ? [language] : [])],
          ticket_url: null,
          source_url: source.source_url,
          raw_language: language,
          raw_version: [format, language].filter(Boolean).join(", ") || null,
        });
      } catch (error) {
        rejected += 1;
        errors.push(`screening_parse_failed:${externalMovieId}:${date}:${time}:${error instanceof Error ? error.message : "unknown"}`);
      }
    }
  }
  return { rows, errors, rejected };
};

const parsePage = (source: CinemaSourceConfig, page: CinemaFetchedPage) => {
  const rows: CinemaNormalizedScreening[] = [];
  const errors: string[] = [];
  let rejected = 0;
  const sections = scheduleSections(page.body).filter((section): section is { date: string; body: string } => Boolean(section.date));
  if (!sections.length) return { rows, errors: ["schedule_sections_missing"], rejected: 0, dates: [] as string[] };

  for (const section of sections) {
    for (const group of movieGroups(section.body)) {
      const parsed = parseMovieBlock(source, section.date, group.href, group.titleHtml, group.block);
      rows.push(...parsed.rows);
      errors.push(...parsed.errors);
      rejected += parsed.rejected;
    }
  }
  return { rows, errors, rejected, dates: sections.map((section) => section.date) };
};

export const cinemaxCzAdapter: CinemaAdapter = {
  key: "cinemax_cz",

  async fetchSnapshot(source): Promise<CinemaRawSnapshotPayload> {
    const fetchedAt = new Date().toISOString();
    if (source.config?.source_kind === "secondary_schedule_fallback" && source.config?.secondary_fallback_approved !== true) {
      return {
        adapter_key: this.key,
        fetched_at: fetchedAt,
        root_url: source.source_url,
        pages: [],
        failures: [{ url: source.source_url, error: "secondary_fallback_not_approved" }],
      };
    }
    try {
      const page = await fetchText(source.source_url);
      if (isCinemaxSk(page.url)) {
        const cinemaUid = cinemaxSkCinemaUid(page.body, source);
        if (!cinemaUid) throw new Error("cinemax_sk_cinema_uid_missing");
        const pid = String(source.config?.pid ?? "227");
        const pages: CinemaFetchedPage[] = [];
        const start = localDateInZone(fetchedAt, source.timezone);
        const days = Math.max(1, source.expected_horizon_days);
        for (let i = 0; i < days; i += 1) {
          const date = addDays(start, i);
          const body = new URLSearchParams({
            "tx_cinemax_ajax[day]": skDate(date),
            "tx_cinemax_ajax[pid]": pid,
            "tx_cinemax_ajax[missingTechnology]": "",
            "tx_cinemax_ajax[technologySelection]": "",
            "tx_cinemax_ajax[uid]": "",
            "tx_cinemax_ajax[viewType]": "filterResultsGrouped",
            "tx_cinemax_ajax[listType]": "list",
            "tx_cinemax_ajax[nextDays]": "0",
            "tx_cinemax_ajax[kino]": cinemaUid,
            "tx_cinemax_ajax[specialFilter]": "",
            "tx_cinemax_ajax[jazykFilter]": "",
            "tx_cinemax_ajax[detskeFilter]": "",
          });
          const ajax = await fetchForm(new URL("/main-ajax", page.url).toString(), body);
          pages.push({ ...ajax, url: `${ajax.url}?date=${date}&kino=${cinemaUid}` });
        }
        return { adapter_key: this.key, fetched_at: fetchedAt, root_url: page.url, pages, failures: [] };
      }
      return { adapter_key: this.key, fetched_at: fetchedAt, root_url: source.source_url, pages: [page], failures: [] };
    } catch (error) {
      return {
        adapter_key: this.key,
        fetched_at: fetchedAt,
        root_url: source.source_url,
        pages: [],
        failures: [{ url: source.source_url, error: error instanceof Error ? error.message : "fetch_failed" }],
      };
    }
  },

  parseSnapshot(source, payload): CinemaParseResult {
    const fetchedLocalDate = localDateInZone(payload.fetched_at, source.timezone);
    const expectedUntil = addDays(fetchedLocalDate, Math.max(0, source.expected_horizon_days - 1));
    const errors = payload.failures.map((failure) => `fetch_failed:${failure.url}:${failure.error}`);
    const parsedRows: CinemaNormalizedScreening[] = [];
    let rejected = 0;
    let discoveredDates: string[] = [];

    for (const page of payload.pages) {
      const date = /[?&]date=(\d{4}-\d{2}-\d{2})/.exec(page.url)?.[1] ?? null;
      const parsed = date && isCinemaxSk(source.source_url)
        ? parseCinemaxSkPage(source, date, page)
        : parsePage(source, page);
      parsedRows.push(...parsed.rows);
      errors.push(...parsed.errors);
      rejected += parsed.rejected;
      discoveredDates.push(...parsed.dates);
    }

    const unique = new Map<string, CinemaNormalizedScreening>();
    for (const row of parsedRows) if (!unique.has(row.screening_fingerprint)) unique.set(row.screening_fingerprint, row);
    const rows = [...unique.values()].sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title));
    const rowDates = rows.map((row) => row.starts_at_local.slice(0, 10)).sort();
    discoveredDates = [...new Set(discoveredDates)].sort();
    const maxDate = rowDates.at(-1) ?? null;
    const fetchComplete = payload.pages.length > 0 && payload.failures.length === 0;
    const zeroResult = rows.length === 0;
    const parserComplete = errors.every((error) => !/^(schedule_sections_missing|movie_identity_missing|format_missing|screening_parse_failed)/.test(error));
    const dateCoverageComplete = discoveredDates.length > 0 && discoveredDates[0] <= fetchedLocalDate && discoveredDates.at(-1)! >= expectedUntil;
    const scopeComplete = fetchComplete && parserComplete && !zeroResult && rows.length >= source.min_records && dateCoverageComplete && maxDate !== null && maxDate >= expectedUntil;

    return {
      rows,
      records_parsed: rows.length + rejected,
      records_valid: rows.length,
      records_rejected: rejected,
      min_schedule_date: rowDates[0] ?? null,
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
        discovered_schedule_dates: discoveredDates,
        unique_screenings: rows.length,
        rejected_screenings: rejected,
        source_kind: source.config?.source_kind ?? null,
      },
    };
  },
};