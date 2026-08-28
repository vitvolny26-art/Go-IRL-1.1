import { createClient } from "https://esm.sh/@supabase/supabase-js@2.108.2";

type GoIrlClaims = {
  aud?: string;
  exp?: number;
  iss?: string;
  role?: string;
  sub?: string;
  go_irl_user_key?: string;
};

type OAuthState = {
  userKey: string;
  profileId: string;
  exp: number;
  nonce: string;
};

type CalendarConnection = {
  profile_id: string;
  owner_user_key: string;
  refresh_token_ciphertext: string;
  granted_scope: string;
  sync_mode: "manual" | "auto";
  calendar_id: string;
  last_synced_at: string | null;
  last_error_code: string | null;
};

type LanguageCode = "ru" | "uk" | "cs" | "en";

type BookingRow = {
  id: string;
  status: string;
  starts_at: string;
  service_ends_at: string;
  client_name_snapshot: string;
  service_name_snapshot: unknown;
  public_location_snapshot: string;
  updated_at: string;
};

type EventMapping = {
  booking_id: string;
  google_event_id: string;
  synced_booking_updated_at: string;
};

const calendarScope = "https://www.googleapis.com/auth/calendar.events";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const supportedLanguageCodes = new Set<LanguageCode>(["ru", "uk", "cs", "en"]);

const calendarDescriptionByLanguage: Record<LanguageCode, string> = {
  ru: "Запись из GO IRL. Изменения записи выполняются в GO IRL.",
  uk: "Запис із GO IRL. Зміни запису виконуються в GO IRL.",
  cs: "Rezervace z GO IRL. Změny rezervace provádějte v GO IRL.",
  en: "GO IRL appointment. Manage changes in GO IRL.",
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    ...corsHeaders,
    "Content-Type": "application/json",
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
  },
});

const requiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
};

const readBearerToken = (request: Request) => {
  const authorization = request.headers.get("authorization") || "";
  return authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
};

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};

const base64UrlToBytes = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const decodeJson = <T>(value: string): T => JSON.parse(decoder.decode(base64UrlToBytes(value))) as T;

async function importHmacKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function verifyGoIrlJwt(token: string, secret: string): Promise<GoIrlClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const header = decodeJson<{ alg?: string; typ?: string }>(parts[0]);
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
    const valid = await crypto.subtle.verify(
      "HMAC",
      await importHmacKey(secret),
      base64UrlToBytes(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    return valid ? decodeJson<GoIrlClaims>(parts[1]) : null;
  } catch {
    return null;
  }
}

async function importTokenKey(secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptRefreshToken(value: string, secret: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await importTokenKey(secret),
    encoder.encode(value),
  ));
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`;
}

async function decryptRefreshToken(value: string, secret: string) {
  const [ivValue, ciphertextValue] = value.split(".");
  if (!ivValue || !ciphertextValue) throw new Error("google_calendar_token_ciphertext_invalid");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(ivValue) },
    await importTokenKey(secret),
    base64UrlToBytes(ciphertextValue),
  );
  return decoder.decode(plaintext);
}

async function createOAuthState(payload: OAuthState, secret: string) {
  const encoded = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await importHmacKey(secret), encoder.encode(encoded)));
  return `${encoded}.${bytesToBase64Url(signature)}`;
}

async function verifyOAuthState(value: string, secret: string): Promise<OAuthState | null> {
  const [encoded, signature] = value.split(".");
  if (!encoded || !signature) return null;
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await importHmacKey(secret),
      base64UrlToBytes(signature),
      encoder.encode(encoded),
    );
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(encoded))) as OAuthState;
    return payload.userKey && payload.profileId && payload.nonce && payload.exp > Math.floor(Date.now() / 1000)
      ? payload
      : null;
  } catch {
    return null;
  }
}

const connectionStatus = (connection?: Partial<CalendarConnection> | null) => ({
  connected: Boolean(connection?.refresh_token_ciphertext),
  syncMode: connection?.sync_mode === "auto" ? "auto" : "manual",
  lastSyncedAt: connection?.last_synced_at || null,
  lastErrorCode: connection?.last_error_code || null,
});

const normalizeLanguageCode = (value: unknown): LanguageCode => {
  const code = typeof value === "string" ? value.trim().toLowerCase().split(/[-_]/)[0] : "";
  return supportedLanguageCodes.has(code as LanguageCode) ? code as LanguageCode : "en";
};

const readServiceName = (value: unknown, language: LanguageCode) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Beauty service";
  const record = value as Record<string, unknown>;
  const localized = record[language];
  if (typeof localized === "string" && localized.trim()) return localized.trim();
  const english = record.en;
  if (typeof english === "string" && english.trim()) return english.trim();
  const first = Object.values(record).find((item) => typeof item === "string" && item.trim());
  return typeof first === "string" ? first.trim() : "Beauty service";
};

const googleEventBody = (booking: BookingRow, language: LanguageCode) => ({
  summary: `${booking.client_name_snapshot} — ${readServiceName(booking.service_name_snapshot, language)}`,
  description: calendarDescriptionByLanguage[language],
  location: booking.public_location_snapshot,
  start: { dateTime: booking.starts_at, timeZone: "Europe/Prague" },
  end: { dateTime: booking.service_ends_at, timeZone: "Europe/Prague" },
  extendedProperties: { private: { goIrlBookingId: booking.id } },
});

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const bearer = readBearerToken(request);
    if (!bearer) return json({ error: "access_denied" }, 401);

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const jwtSecret = requiredEnv("GO_IRL_JWT_SECRET");
    const claims = await verifyGoIrlJwt(bearer, jwtSecret);
    const now = Math.floor(Date.now() / 1000);
    if (
      !claims
      || claims.iss !== "go-irl-supabase-edge"
      || claims.aud !== "authenticated"
      || claims.role !== "authenticated"
      || !claims.sub
      || !claims.go_irl_user_key
      || !claims.exp
      || claims.exp <= now
    ) return json({ error: "access_denied" }, 403);

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const appUser = await supabase.from("app_users").select("id,user_key,status,language_code").eq("user_key", claims.go_irl_user_key).maybeSingle();
    if (appUser.error) throw appUser.error;
    if (!appUser.data || appUser.data.id !== claims.sub || appUser.data.status !== "active") return json({ error: "access_denied" }, 403);
    const language = normalizeLanguageCode(appUser.data.language_code);

    const profileResult = await supabase
      .from("beauty_professional_profiles")
      .select("id,owner_user_key")
      .eq("owner_user_key", claims.go_irl_user_key)
      .limit(1)
      .maybeSingle();
    if (profileResult.error) throw profileResult.error;
    if (!profileResult.data?.id) return json({ error: "professional_profile_required" }, 403);
    const profileId = String(profileResult.data.id);
    const userKey = claims.go_irl_user_key;

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = typeof body.action === "string" ? body.action : "status";
    const connectionResult = await supabase
      .from("beauty_google_calendar_connections")
      .select("profile_id,owner_user_key,refresh_token_ciphertext,granted_scope,sync_mode,calendar_id,last_synced_at,last_error_code")
      .eq("profile_id", profileId)
      .eq("owner_user_key", userKey)
      .maybeSingle();
    if (connectionResult.error) throw connectionResult.error;
    const connection = connectionResult.data as CalendarConnection | null;

    if (action === "status") return json(connectionStatus(connection));

    if (action === "connect") {
      const clientId = requiredEnv("GOOGLE_CALENDAR_CLIENT_ID");
      const redirectUri = requiredEnv("GO_IRL_GOOGLE_CALENDAR_REDIRECT_URI");
      const stateSecret = requiredEnv("GO_IRL_GOOGLE_CALENDAR_STATE_SECRET");
      const state = await createOAuthState({ userKey, profileId, exp: now + 10 * 60, nonce: crypto.randomUUID() }, stateSecret);
      const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authorizationUrl.searchParams.set("client_id", clientId);
      authorizationUrl.searchParams.set("redirect_uri", redirectUri);
      authorizationUrl.searchParams.set("response_type", "code");
      authorizationUrl.searchParams.set("access_type", "offline");
      authorizationUrl.searchParams.set("prompt", "consent");
      authorizationUrl.searchParams.set("include_granted_scopes", "true");
      authorizationUrl.searchParams.set("scope", calendarScope);
      authorizationUrl.searchParams.set("state", state);
      return json({ ...connectionStatus(connection), authorizationUrl: authorizationUrl.toString() });
    }

    if (action === "complete") {
      const code = typeof body.code === "string" ? body.code.trim() : "";
      const stateValue = typeof body.state === "string" ? body.state.trim() : "";
      const state = await verifyOAuthState(stateValue, requiredEnv("GO_IRL_GOOGLE_CALENDAR_STATE_SECRET"));
      if (!code || !state || state.userKey !== userKey || state.profileId !== profileId) return json({ error: "google_calendar_oauth_state_invalid" }, 400);
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: requiredEnv("GOOGLE_CALENDAR_CLIENT_ID"), client_secret: requiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET"), code, redirect_uri: requiredEnv("GO_IRL_GOOGLE_CALENDAR_REDIRECT_URI"), grant_type: "authorization_code" }) });
      const tokenPayload = await tokenResponse.json().catch(() => ({})) as { refresh_token?: string; scope?: string; error?: string };
      if (!tokenResponse.ok) return json({ error: tokenPayload.error || "google_calendar_code_exchange_failed" }, 400);
      const refreshTokenCiphertext = tokenPayload.refresh_token ? await encryptRefreshToken(tokenPayload.refresh_token, requiredEnv("GO_IRL_GOOGLE_CALENDAR_TOKEN_KEY")) : connection?.refresh_token_ciphertext;
      if (!refreshTokenCiphertext) return json({ error: "google_calendar_refresh_token_missing" }, 400);
      const upsert = await supabase.from("beauty_google_calendar_connections").upsert({ profile_id: profileId, owner_user_key: userKey, refresh_token_ciphertext: refreshTokenCiphertext, granted_scope: tokenPayload.scope || connection?.granted_scope || calendarScope, sync_mode: connection?.sync_mode || "manual", calendar_id: connection?.calendar_id || "primary", last_error_code: null }, { onConflict: "profile_id" });
      if (upsert.error) throw upsert.error;
      return json({ connected: true, syncMode: connection?.sync_mode || "manual", lastSyncedAt: connection?.last_synced_at || null, lastErrorCode: null });
    }

    if (!connection) return json({ error: "google_calendar_not_connected", ...connectionStatus(null) }, 409);
    if (action === "set_mode") {
      const mode = body.mode === "auto" ? "auto" : body.mode === "manual" ? "manual" : null;
      if (!mode) return json({ error: "google_calendar_mode_invalid" }, 400);
      const update = await supabase.from("beauty_google_calendar_connections").update({ sync_mode: mode, last_error_code: null }).eq("profile_id", profileId).eq("owner_user_key", userKey);
      if (update.error) throw update.error;
      return json({ ...connectionStatus({ ...connection, sync_mode: mode, last_error_code: null }) });
    }
    if (action === "disconnect") {
      try {
        const refreshToken = await decryptRefreshToken(connection.refresh_token_ciphertext, requiredEnv("GO_IRL_GOOGLE_CALENDAR_TOKEN_KEY"));
        await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refreshToken }) });
      } catch {}
      const remove = await supabase.from("beauty_google_calendar_connections").delete().eq("profile_id", profileId).eq("owner_user_key", userKey);
      if (remove.error) throw remove.error;
      return json(connectionStatus(null));
    }
    if (action !== "sync") return json({ error: "unsupported_action" }, 400);
    if (body.onlyIfAuto === true && connection.sync_mode !== "auto") return json({ ...connectionStatus(connection), synced: 0, removed: 0 });

    const refreshToken = await decryptRefreshToken(connection.refresh_token_ciphertext, requiredEnv("GO_IRL_GOOGLE_CALENDAR_TOKEN_KEY"));
    const accessResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: requiredEnv("GOOGLE_CALENDAR_CLIENT_ID"), client_secret: requiredEnv("GOOGLE_CALENDAR_CLIENT_SECRET"), refresh_token: refreshToken, grant_type: "refresh_token" }) });
    const accessPayload = await accessResponse.json().catch(() => ({})) as { access_token?: string; error?: string };
    if (!accessResponse.ok || !accessPayload.access_token) {
      await supabase.from("beauty_google_calendar_connections").update({ last_error_code: accessPayload.error || "google_calendar_refresh_failed" }).eq("profile_id", profileId);
      return json({ error: accessPayload.error || "google_calendar_refresh_failed" }, 502);
    }

    const fromDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const bookingsResult = await supabase.from("beauty_bookings").select("id,status,starts_at,service_ends_at,client_name_snapshot,service_name_snapshot,public_location_snapshot,updated_at").eq("profile_id", profileId).gte("starts_at", fromDate).order("starts_at", { ascending: true }).limit(500);
    if (bookingsResult.error) throw bookingsResult.error;
    const mappingsResult = await supabase.from("beauty_google_calendar_events").select("booking_id,google_event_id,synced_booking_updated_at").eq("profile_id", profileId);
    if (mappingsResult.error) throw mappingsResult.error;
    const mappings = new Map((mappingsResult.data || []).map((item) => [String(item.booking_id), item as EventMapping]));
    const calendarId = encodeURIComponent(connection.calendar_id || "primary");
    const googleHeaders = { Authorization: `Bearer ${accessPayload.access_token}`, "Content-Type": "application/json" };
    let synced = 0; let removed = 0;
    for (const booking of (bookingsResult.data || []) as BookingRow[]) {
      const mapping = mappings.get(booking.id);
      if (["cancelled", "declined", "expired"].includes(booking.status)) {
        if (!mapping) continue;
        const removeEvent = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(mapping.google_event_id)}`, { method: "DELETE", headers: googleHeaders });
        if (!removeEvent.ok && removeEvent.status !== 404 && removeEvent.status !== 410) throw new Error("google_calendar_event_delete_failed");
        const removeMapping = await supabase.from("beauty_google_calendar_events").delete().eq("booking_id", booking.id);
        if (removeMapping.error) throw removeMapping.error;
        removed += 1; continue;
      }
      if (booking.status !== "confirmed") continue;
      const eventBody = googleEventBody(booking, language);
      let eventId = mapping?.google_event_id || "";
      if (eventId) {
        const patch = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`, { method: "PATCH", headers: googleHeaders, body: JSON.stringify(eventBody) });
        if (patch.status === 404 || patch.status === 410) eventId = ""; else if (!patch.ok) throw new Error("google_calendar_event_update_failed");
      }
      if (!eventId) {
        const insert = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, { method: "POST", headers: googleHeaders, body: JSON.stringify(eventBody) });
        const inserted = await insert.json().catch(() => ({})) as { id?: string };
        if (!insert.ok || !inserted.id) throw new Error("google_calendar_event_create_failed");
        eventId = inserted.id;
      }
      const mapEvent = await supabase.from("beauty_google_calendar_events").upsert({ booking_id: booking.id, profile_id: profileId, google_event_id: eventId, synced_booking_updated_at: booking.updated_at, last_synced_at: new Date().toISOString() }, { onConflict: "booking_id" });
      if (mapEvent.error) throw mapEvent.error;
      synced += 1;
    }
    const lastSyncedAt = new Date().toISOString();
    const updateConnection = await supabase.from("beauty_google_calendar_connections").update({ last_synced_at: lastSyncedAt, last_error_code: null }).eq("profile_id", profileId).eq("owner_user_key", userKey);
    if (updateConnection.error) throw updateConnection.error;
    return json({ connected: true, syncMode: connection.sync_mode, lastSyncedAt, lastErrorCode: null, synced, removed });
  } catch (error) {
    const code = error instanceof Error && /^[a-z0-9_]+$/i.test(error.message) ? error.message : "google_calendar_internal_error";
    return json({ error: code }, 500);
  }
});
