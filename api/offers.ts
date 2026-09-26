import { createClient } from "@supabase/supabase-js";
import { cities as configuredCities } from "../src/config/cities.js";
import { authorizeAdminRequest, productionAdminAuthorizationDependencies } from "./_shared/admin-authorization.js";
import { requireEnv } from "./_shared/env.js";
import { createVercelHandler } from "./_shared/vercel-handler.js";
import { resolveCityTelegramChatId, resolveCityTelegramPromotionsTopicId } from "./_shared/telegram-city-publication-core.js";

const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

const supportedLanguages = new Set(["ru", "uk", "cs", "en", "pl", "sk"]);
const cityById = new Map(configuredCities.map((city) => [city.id, city]));
const supportedCities = new Set(cityById.keys());
const supportedStatuses = new Set(["draft", "ready", "published"]);
const supportedVerticals = new Set(["cinema", "concerts", "festivals", "sport", "theatre", "comedy", "exhibitions", "family", "education", "nightlife", "city_special", "other"]);
const supportedTopics = new Set(["auto", "promotions", "chat", "music", "culture", "sport", "outdoor", "education", "games", "kids", "festival"]);

const adminDb = () => createClient(
  requireEnv("SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const slugify = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 48) || "offer";

const httpsUrl = (value: unknown) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
};

const cleanText = (value: unknown, limit: number) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";

type LocalDateTimeParts = { year: number; month: number; day: number; hour: number; minute: number };

const parseLocalDateTime = (value: string): LocalDateTimeParts | null => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
  const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  if (
    check.getUTCFullYear() !== parts.year
    || check.getUTCMonth() + 1 !== parts.month
    || check.getUTCDate() !== parts.day
    || check.getUTCHours() !== parts.hour
    || check.getUTCMinutes() !== parts.minute
  ) return null;
  return parts;
};

const localWallMs = (parts: LocalDateTimeParts) =>
  Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);

const partsAtTimeZone = (date: Date, timeZone: string): LocalDateTimeParts => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
};

const zonedLocalDateTimeToUtc = (value: string, timeZone: string) => {
  const target = parseLocalDateTime(value);
  if (!target) return null;
  const targetWall = localWallMs(target);
  let instant = targetWall;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = partsAtTimeZone(new Date(instant), timeZone);
    const adjustment = targetWall - localWallMs(actual);
    if (!adjustment) break;
    instant += adjustment;
  }
  const verified = partsAtTimeZone(new Date(instant), timeZone);
  if (
    verified.year !== target.year
    || verified.month !== target.month
    || verified.day !== target.day
    || verified.hour !== target.hour
    || verified.minute !== target.minute
  ) return null;
  return new Date(instant);
};

const readPublishedOffers = async (cityId: string, language: string) => {
  const db = adminDb();
  const eventsResult = await db
    .from("city_posters_events")
    .select("id,city_id,vertical,canonical_slug,hero_media_url,organizer_name,metadata")
    .eq("status", "published")
    .eq("city_id", cityId)
    .not("hero_media_url", "is", null);
  if (eventsResult.error) throw eventsResult.error;

  const events = (eventsResult.data || []).filter((row) => {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
    return metadata.test !== true && metadata.created_via === "admin_offer_creation";
  });
  const eventIds = events.map((row) => String(row.id));
  if (!eventIds.length) return [];

  const [translationsResult, occurrencesResult, eventOffersResult] = await Promise.all([
    db.from("city_posters_event_translations").select("event_id,language,title,description").in("event_id", eventIds),
    db.from("city_posters_occurrences").select("id,event_id,starts_at,ends_at,timezone,occurrence_url,status,metadata").in("event_id", eventIds).in("status", ["scheduled", "postponed", "rescheduled"]).order("starts_at", { ascending: true }),
    db.from("city_posters_offers").select("id,event_id,occurrence_id,provider_name,url,price_from,price_to,currency,metadata").in("event_id", eventIds).eq("active", true),
  ]);
  if (translationsResult.error) throw translationsResult.error;
  if (occurrencesResult.error) throw occurrencesResult.error;
  if (eventOffersResult.error) throw eventOffersResult.error;

  const now = Date.now();
  const occurrences = (occurrencesResult.data || []).filter((row) => !row.ends_at || Date.parse(String(row.ends_at)) > now);
  const occurrenceIds = occurrences.map((row) => String(row.id));
  const occurrenceOffersResult = occurrenceIds.length
    ? await db.from("city_posters_offers").select("id,event_id,occurrence_id,provider_name,url,price_from,price_to,currency,metadata").in("occurrence_id", occurrenceIds).eq("active", true)
    : { data: [], error: null };
  if (occurrenceOffersResult.error) throw occurrenceOffersResult.error;

  const translations = translationsResult.data || [];
  const offers = [...(eventOffersResult.data || []), ...(occurrenceOffersResult.data || [])];

  return events.flatMap((event) => {
    const occurrence = occurrences.find((row) => row.event_id === event.id);
    if (!occurrence) return [];
    const candidates = translations.filter((row) => row.event_id === event.id);
    const translation = candidates.find((row) => row.language === language)
      || candidates.find((row) => row.language === "en")
      || candidates.find((row) => row.language === "ru")
      || candidates[0];
    if (!translation) return [];
    const offer = offers.find((row) => row.event_id === event.id || row.occurrence_id === occurrence.id);
    const metadata = event.metadata && typeof event.metadata === "object" ? event.metadata as Record<string, unknown> : {};
    const offerMetadata = offer?.metadata && typeof offer.metadata === "object" ? offer.metadata as Record<string, unknown> : {};
    const officialUrl = httpsUrl(offer?.url) || httpsUrl(occurrence.occurrence_url) || httpsUrl(metadata.official_url) || httpsUrl(metadata.official_source);
    if (!officialUrl) return [];
    return [{
      eventId: event.id,
      cityId: event.city_id,
      vertical: event.vertical,
      canonicalSlug: event.canonical_slug,
      title: translation.title,
      description: translation.description,
      startsAt: occurrence.starts_at,
      endsAt: occurrence.ends_at,
      timezone: occurrence.timezone,
      coverUrl: event.hero_media_url,
      organizerName: event.organizer_name,
      officialUrl,
      providerName: offer?.provider_name || event.organizer_name || "",
      priceFrom: offer?.price_from ?? null,
      priceTo: offer?.price_to ?? null,
      currency: offer?.currency ?? null,
      priceConditions: cleanText(offerMetadata.price_conditions ?? metadata.price_conditions, 500),
      free: metadata.admission === "free",
    }];
  });
};

const cleanupCreated = async (db: ReturnType<typeof adminDb>, eventIds: string[]) => {
  for (const eventId of [...eventIds].reverse()) {
    const deleted = await db.from("city_posters_events").delete().eq("id", eventId);
    if (deleted.error) {
      console.error("city_posters_offer_cleanup_failed", { eventId, reason: deleted.error.message.slice(0, 120) });
    }
  }
};

const createOffers = async (request: Request) => {
  const authorization = await authorizeAdminRequest(request, productionAdminAuthorizationDependencies());
  if ("status" in authorization) return json(authorization.status, { error: authorization.error });

  const raw = await request.json().catch(() => null) as Record<string, unknown> | null;
  const title = cleanText(raw?.title, 140);
  const description = cleanText(raw?.description, 2000);
  const coverUrl = httpsUrl(raw?.coverUrl);
  const officialUrl = httpsUrl(raw?.officialUrl);
  const language = supportedLanguages.has(String(raw?.language)) ? String(raw?.language) : "cs";
  const status = supportedStatuses.has(String(raw?.status)) ? String(raw?.status) : "draft";
  const vertical = supportedVerticals.has(String(raw?.vertical)) ? String(raw?.vertical) : "city_special";
  const telegramTopicKind = supportedTopics.has(String(raw?.telegramTopicKind)) ? String(raw?.telegramTopicKind) : "auto";
  const telegramText = cleanText(raw?.telegramText, 3500);
  const priceConditions = cleanText(raw?.priceConditions, 500);
  const providerName = cleanText(raw?.providerName, 120) || "Official";
  const currency = typeof raw?.currency === "string" && /^[A-Z]{3}$/.test(raw.currency.trim().toUpperCase()) ? raw.currency.trim().toUpperCase() : "CZK";
  const priceFrom = raw?.priceFrom === "" || raw?.priceFrom === null || raw?.priceFrom === undefined ? null : Number(raw.priceFrom);
  const priceTo = raw?.priceTo === "" || raw?.priceTo === null || raw?.priceTo === undefined ? null : Number(raw.priceTo);
  const cities = Array.isArray(raw?.cities) ? [...new Set(raw.cities.filter((value): value is string => typeof value === "string" && supportedCities.has(value)))] : [];
  const startsAtLocal = cleanText(raw?.startsAt, 32);
  const endsAtLocal = cleanText(raw?.endsAt, 32);
  const startsAtParts = parseLocalDateTime(startsAtLocal);
  const endsAtParts = parseLocalDateTime(endsAtLocal);
  const hasStart = Boolean(startsAtParts);
  const hasEnd = Boolean(endsAtParts);
  const hasPeriod = Boolean(startsAtParts && endsAtParts && localWallMs(endsAtParts) > localWallMs(startsAtParts));

  if (!title || !description || !coverUrl || !officialUrl || !cities.length) return json(400, { error: "offer_fields_required" });
  if ((startsAtLocal && !startsAtParts) || (endsAtLocal && !endsAtParts)) return json(400, { error: "offer_period_invalid" });
  if (hasEnd && !hasStart) return json(400, { error: "offer_period_start_required" });
  if (startsAtParts && endsAtParts && !hasPeriod) return json(400, { error: "offer_period_invalid" });
  if ((priceFrom !== null && (!Number.isFinite(priceFrom) || priceFrom < 0)) || (priceTo !== null && (!Number.isFinite(priceTo) || priceTo < 0 || (priceFrom !== null && priceTo < priceFrom)))) {
    return json(400, { error: "offer_price_invalid" });
  }
  if (status !== "draft" && !hasPeriod) return json(400, { error: "publication_period_required" });
  if (status !== "draft") {
    const missingDestinations = cities.filter((cityId) => !resolveCityTelegramChatId(cityId));
    if (missingDestinations.length) return json(400, { error: "telegram_destination_unavailable", cities: missingDestinations });
    if (telegramTopicKind === "promotions") {
      const missingPromotionTopics = cities.filter((cityId) => !resolveCityTelegramPromotionsTopicId(cityId));
      if (missingPromotionTopics.length) return json(400, { error: "telegram_topic_unavailable", topic: "promotions", cities: missingPromotionTopics });
    }
  }

  const db = adminDb();
  const campaignKey = slugify(title) + "-" + crypto.randomUUID().slice(0, 8);
  const created: string[] = [];
  try {
    for (const cityId of cities) {
      const city = cityById.get(cityId);
      if (!city) throw new Error("offer_city_config_missing");
      const eventStatus = status === "published" ? "ready" : status;
      const eventInsert = await db.from("city_posters_events").insert({
        vertical,
        subcategory: "offer",
        city_id: cityId,
        canonical_slug: campaignKey + "-" + cityId,
        organizer_name: providerName,
        status: eventStatus,
        hero_media_url: coverUrl,
        original_language: language,
        metadata: {
          task: "AFISHI012",
          campaign: campaignKey,
          campaign_key: campaignKey,
          created_via: "admin_offer_creation",
          official_url: officialUrl,
          price_conditions: priceConditions,
          telegram_text: telegramText || description,
          telegram_topic_kind: telegramTopicKind,
          period_start_defined: hasStart,
          period_defined: hasPeriod,
        },
      }).select("id").single();
      if (eventInsert.error || !eventInsert.data?.id) throw eventInsert.error || new Error("offer_event_create_failed");
      const eventId = String(eventInsert.data.id);
      created.push(eventId);

      const translationInsert = await db.from("city_posters_event_translations").insert({
        event_id: eventId,
        language,
        title,
        description,
        source_kind: "editorial",
        verified: true,
      });
      if (translationInsert.error) throw translationInsert.error;

      const startsAt = hasStart ? zonedLocalDateTimeToUtc(startsAtLocal, city.timezone) : new Date();
      const endsAt = hasPeriod ? zonedLocalDateTimeToUtc(endsAtLocal, city.timezone) : null;
      if (!startsAt || (hasPeriod && (!endsAt || endsAt.getTime() <= startsAt.getTime()))) throw new Error("offer_period_invalid_for_city");
      const occurrenceInsert = await db.from("city_posters_occurrences").insert({
        event_id: eventId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt?.toISOString() || null,
        timezone: city.timezone,
        status: "scheduled",
        sales_state: "available",
        occurrence_url: officialUrl,
        metadata: { task: "AFISHI012", campaign: campaignKey, period_start_defined: hasStart, period_defined: hasPeriod },
      }).select("id").single();
      if (occurrenceInsert.error || !occurrenceInsert.data?.id) throw occurrenceInsert.error || new Error("offer_occurrence_create_failed");
      const occurrenceId = String(occurrenceInsert.data.id);

      const offerInsert = await db.from("city_posters_offers").insert({
        occurrence_id: occurrenceId,
        provider_name: providerName,
        url: officialUrl,
        price_from: priceFrom,
        price_to: priceTo,
        currency: priceFrom === null && priceTo === null ? null : currency,
        availability_state: "available",
        official: true,
        active: true,
        last_verified_at: new Date().toISOString(),
        metadata: { task: "AFISHI012", campaign: campaignKey, price_conditions: priceConditions },
      });
      if (offerInsert.error) throw offerInsert.error;
    }

    const eventIds = [...created];
    let warning: "telegram_publication_failed" | null = null;

    if (status === "published") {
      const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
      let publishOk = false;
      let publishDetail: unknown = null;
      try {
        const publishResponse = await fetch(requireEnv("SUPABASE_URL").replace(/\/+$/, "") + "/functions/v1/telegramEventSupergroup", {
          method: "POST",
          headers: {
            apikey: serviceRoleKey,
            authorization: "Bearer " + serviceRoleKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: "publish_city_poster_events", eventIds, language }),
        });
        publishDetail = await publishResponse.json().catch(() => null);
        publishOk = publishResponse.ok;
      } catch (error) {
        publishDetail = { error: error instanceof Error ? error.message.slice(0, 120) : "telegram_publication_request_failed" };
      }

      if (!publishOk) {
        const states = await db.from("city_posters_events").select("id,status").in("id", eventIds);
        if (states.error) throw states.error;
        const allPublished = (states.data || []).length === eventIds.length
          && (states.data || []).every((row) => row.status === "published");
        if (!allPublished) {
          await cleanupCreated(db, created);
          console.error("city_posters_offer_publish_failed", { campaignKey, detail: publishDetail });
          return json(502, { error: "offer_publish_failed", campaignKey, eventIds });
        }
        warning = "telegram_publication_failed";
      }
    }

    const audit = await db.from("audit_log").insert({
      actor_user_key: authorization.userKey,
      action: "city_posters.offer_created",
      entity_type: "city_posters_campaign",
      entity_id: campaignKey,
      metadata: { task: "AFISHI012", status, event_ids: eventIds, cities, warning },
    });
    if (audit.error) {
      console.warn("city_posters_offer_audit_failed", { campaignKey, reason: audit.error.message.slice(0, 120) });
    }

    return json(warning ? 202 : 201, { ok: true, campaignKey, eventIds, status, ...(warning ? { warning } : {}) });
  } catch (error) {
    await cleanupCreated(db, created);
    console.error("city_posters_offer_create_failed", { reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return json(503, { error: "offer_create_failed" });
  }
};

export async function handleOffers(request: Request) {
  if (request.method === "GET") {
    const url = new URL(request.url);
    const cityId = url.searchParams.get("city") || "";
    const requestedLanguage = url.searchParams.get("language") || "";
    const language = supportedLanguages.has(requestedLanguage) ? requestedLanguage : "cs";
    if (!supportedCities.has(cityId)) return json(400, { error: "city_invalid" });
    try {
      return json(200, { offers: await readPublishedOffers(cityId, language) });
    } catch (error) {
      console.error("city_posters_offers_read_failed", { reason: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
      return json(503, { error: "offers_unavailable" });
    }
  }
  if (request.method === "POST") return createOffers(request);
  return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
}

export default createVercelHandler(handleOffers);
