import { createHash } from "node:crypto";
import type {
  CinemaAdapter,
  CinemaFetchedPage,
  CinemaRawSnapshotPayload,
  CinemaSourceConfig,
} from "../cinema-ingestion-types.js";

const requestTimeoutMs = 20_000;
const promotionConcurrency = 4;
const userAgent = "GO-IRL-Cinema-Ingestion/2.0 (+promotion monitoring; contact via GO IRL)";

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
  const output: R[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor++;
      try { output[index] = await fn(values[index]); } catch { /* promotion fetch is best-effort */ }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output.filter((value): value is R => Boolean(value));
};

const isSchedulePage = (url: string) => {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "");
    return /\/filmy$/.test(path) || /\/filmy\/movie\/\d+-[^/]+$/.test(path);
  } catch {
    return false;
  }
};

const isPromotionDetailPage = (url: string) => {
  try {
    return /^\/cz\/[^/]+\/akce\/[^/?#]+\/?$/.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

const discoverPromotionUrls = (html: string, base: string) => {
  const baseUrl = new URL(base);
  const urls = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
    const url = safeUrl(match[1], base);
    if (!url) continue;
    const parsed = new URL(url);
    if (parsed.origin !== baseUrl.origin) continue;
    if (!/^\/cz\/[^/]+\/akce\/[^/?#]+\/?$/.test(parsed.pathname)) continue;
    urls.add(`${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`);
  }
  return [...urls].sort();
};

const months: Record<string, number> = {
  leden: 1, ledna: 1,
  unor: 2, únor: 2, unora: 2, února: 2,
  brezen: 3, březen: 3, brezna: 3, března: 3,
  duben: 4, dubna: 4,
  kveten: 5, květen: 5, kvetna: 5, května: 5,
  cerven: 6, červen: 6, cervna: 6, června: 6,
  cervenec: 7, červenec: 7, cervence: 7, července: 7,
  srpen: 8, srpna: 8,
  zari: 9, září: 9,
  rijen: 10, říjen: 10, rijna: 10, října: 10,
  listopad: 11, listopadu: 11,
  prosinec: 12, prosince: 12,
};

const isoDate = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const parseDateRange = (text: string, fetchedAt: string) => {
  const defaultYear = new Date(fetchedAt).getUTCFullYear();
  const normalized = text.toLocaleLowerCase("cs-CZ").replace(/[–—]/g, "-");

  const sameMonthWords = new RegExp(
    `\\b(\\d{1,2})\\.\\s*(?:a|-)\\s*(\\d{1,2})\\.\\s*(${Object.keys(months).sort((a, b) => b.length - a.length).join("|")})(?:\\s+(20\\d{2}))?\\b`,
    "i",
  ).exec(normalized);
  if (sameMonthWords) {
    const month = months[sameMonthWords[3].toLocaleLowerCase("cs-CZ")];
    const year = Number(sameMonthWords[4] || defaultYear);
    const start = isoDate(year, month, Number(sameMonthWords[1]));
    const end = isoDate(year, month, Number(sameMonthWords[2]));
    if (start && end) return { start, end };
  }

  const fullNumeric = /\b(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})\s*-\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})\b/.exec(normalized);
  if (fullNumeric) {
    const start = isoDate(Number(fullNumeric[3]), Number(fullNumeric[2]), Number(fullNumeric[1]));
    const end = isoDate(Number(fullNumeric[6]), Number(fullNumeric[5]), Number(fullNumeric[4]));
    if (start && end) return { start, end };
  }

  const sameMonthNumeric = /\b(\d{1,2})\.\s*-\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})\b/.exec(normalized);
  if (sameMonthNumeric) {
    const year = Number(sameMonthNumeric[4]);
    const month = Number(sameMonthNumeric[3]);
    const start = isoDate(year, month, Number(sameMonthNumeric[1]));
    const end = isoDate(year, month, Number(sameMonthNumeric[2]));
    if (start && end) return { start, end };
  }

  const singleWord = new RegExp(
    `\\b(\\d{1,2})\\.\\s*(${Object.keys(months).sort((a, b) => b.length - a.length).join("|")})(?:\\s+(20\\d{2}))?\\b`,
    "i",
  ).exec(normalized);
  if (singleWord) {
    const date = isoDate(
      Number(singleWord[3] || defaultYear),
      months[singleWord[2].toLocaleLowerCase("cs-CZ")],
      Number(singleWord[1]),
    );
    if (date) return { start: date, end: date };
  }

  const singleNumeric = /\b(\d{1,2})\.\s*(\d{1,2})\.\s*(20\d{2})\b/.exec(normalized);
  if (singleNumeric) {
    const date = isoDate(Number(singleNumeric[3]), Number(singleNumeric[2]), Number(singleNumeric[1]));
    if (date) return { start: date, end: date };
  }

  return null;
};

const discountSignal = (text: string) => {
  const lower = text.toLocaleLowerCase("cs-CZ");
  return /\b(?:sleva|slevy|slevou|akční cena|zvýhodněn(?:á|é|ou)?|výhodn(?:á|é|ou)? cena)\b/.test(lower)
    || /\b(?:vstupen(?:ka|ky)|líst(?:ek|ky)|filmy?)?\s*(?:jen\s+)?za\s+\d{1,4}\s*kč\b/.test(lower)
    || /\b\d{1,2}\s*%\s*(?:sleva|slevy|levněji)\b/.test(lower);
};

const fixedPromoPrice = (text: string) => {
  const patterns = [
    /\b(?:vstupen(?:ka|ky)|líst(?:ek|ky)|filmy?)\s+(?:jen\s+)?za\s+(\d{1,4})\s*kč\b/i,
    /\b(?:jednotn(?:á|ou)\s+cen(?:a|u)|akční\s+cen(?:a|u))[^0-9]{0,24}(\d{1,4})\s*kč\b/i,
    /\b(?:jen\s+)?za\s+(\d{1,4})\s*kč\b/i,
  ];
  for (const pattern of patterns) {
    const value = pattern.exec(text)?.[1];
    if (value) return Number(value);
  }
  return null;
};

const promotionTitle = (html: string) => {
  const h1 = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1];
  if (h1) return textFromHtml(h1).trim();
  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return title ? textFromHtml(title).replace(/\s*[|–-]\s*CineStar.*$/i, "").trim() : "";
};

const promotionSlug = (url: string) => {
  try {
    const path = new URL(url).pathname.replace(/\/$/, "");
    return path.split("/").at(-1) || "promotion";
  } catch {
    return "promotion";
  }
};

export type CineStarDiscountPromotion = {
  key: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  all_day: true;
  promo_price: number | null;
  currency: "CZK";
  discount_text: string;
  terms: string;
  source_url: string;
};

export const parseCineStarDiscountPromotionForTest = (
  page: CinemaFetchedPage,
  fetchedAt: string,
  sourceId = "cinestar_cz",
): CineStarDiscountPromotion | null => {
  if (!isPromotionDetailPage(page.url)) return null;
  const text = textFromHtml(page.body);
  if (!discountSignal(text)) return null;
  const range = parseDateRange(text, fetchedAt);
  if (!range) return null;
  const title = promotionTitle(page.body);
  if (!title) return null;
  const promoPrice = fixedPromoPrice(text);
  const description = text.slice(0, 700);
  const terms = text.slice(0, 1600);
  const discountText = promoPrice !== null
    ? `Akční vstupné ${promoPrice} Kč`
    : text.match(/[^.!?]*(?:sleva|slevy|akční cena|zvýhodněn)[^.!?]*[.!?]?/i)?.[0]?.trim() || "Slevová akce";
  const stable = `${sourceId}|${promotionSlug(page.url)}|${range.start}|${range.end}`;

  return {
    key: `sha256:${createHash("sha256").update(stable).digest("hex")}`,
    title,
    description,
    start_date: range.start,
    end_date: range.end,
    all_day: true,
    promo_price: promoPrice,
    currency: "CZK",
    discount_text: discountText,
    terms,
    source_url: page.url,
  };
};

const schedulePayload = (payload: CinemaRawSnapshotPayload): CinemaRawSnapshotPayload => ({
  ...payload,
  pages: payload.pages.filter((page) => isSchedulePage(page.url)),
});

const promotionPages = (payload: CinemaRawSnapshotPayload) => payload.pages.filter((page) => isPromotionDetailPage(page.url));

export const withCineStarPromotions = (base: CinemaAdapter): CinemaAdapter => ({
  key: base.key,

  async fetchSnapshot(source: CinemaSourceConfig) {
    const snapshot = await base.fetchSnapshot(source);
    const root = source.source_url.endsWith("/") ? source.source_url : `${source.source_url}/`;
    const indexUrl = new URL("akce", root).toString();

    try {
      const index = await fetchText(indexUrl);
      snapshot.pages.push(index);
      const urls = discoverPromotionUrls(index.body, index.url);
      const pages = await mapConcurrent(urls, promotionConcurrency, fetchText);
      snapshot.pages.push(...pages);
    } catch {
      // Promotions are auxiliary. A failed /akce fetch must never quarantine a valid cinema schedule.
    }

    return snapshot;
  },

  parseSnapshot(source, payload) {
    const parsed = base.parseSnapshot(source, schedulePayload(payload));
    const promotions = promotionPages(payload)
      .map((page) => parseCineStarDiscountPromotionForTest(page, payload.fetched_at, source.source_id))
      .filter((value): value is CineStarDiscountPromotion => Boolean(value));
    const unique = new Map(promotions.map((promotion) => [promotion.key, promotion]));

    return {
      ...parsed,
      metrics: {
        ...parsed.metrics,
        promotion_pages: promotionPages(payload).length,
        discount_promotions: [...unique.values()],
      },
    };
  },
});
