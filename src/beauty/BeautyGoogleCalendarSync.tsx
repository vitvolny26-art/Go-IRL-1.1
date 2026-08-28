import { useCallback, useEffect, useRef, useState } from "react";
import { getTrustedAccessToken } from "../authSession";
import type { Language } from "../types";

export type BeautyGoogleCalendarStatus = {
  connected: boolean;
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
};

type CalendarActionResponse = BeautyGoogleCalendarStatus & {
  authorizationUrl?: string;
  synced?: number;
  removed?: number;
  error?: string;
};

const statusChangedEvent = "go-irl-beauty-google-calendar-status-changed";
const callbackKeys = ["code", "state", "scope", "authuser", "prompt", "hd"] as const;

const localeByLanguage = { ru: "ru", uk: "uk", cs: "cs", en: "en" } as const;

const copy = {
  ru: {
    title: "Google Calendar",
    hint: "Записи GO IRL остаются основными. В Google отправляются имя клиента, услуга, время и публичное место — без телефона клиента.",
    connect: "Подключить Google Calendar",
    connected: "Подключен",
    disconnected: "Не подключен",
    syncNow: "Синхронизировать сейчас",
    disconnect: "Отключить",
    lastSync: "Последняя синхронизация",
    never: "ещё не было",
    busy: "Синхронизация…",
    error: "Не удалось выполнить синхронизацию Google Calendar.",
    unavailable: "Google Calendar пока недоступен для этой учётной записи.",
  },
  uk: {
    title: "Google Calendar",
    hint: "Записи GO IRL залишаються основними. У Google надсилаються ім'я клієнта, послуга, час і публічне місце — без телефону клієнта.",
    connect: "Підключити Google Calendar",
    connected: "Підключено",
    disconnected: "Не підключено",
    syncNow: "Синхронізувати зараз",
    disconnect: "Відключити",
    lastSync: "Остання синхронізація",
    never: "ще не було",
    busy: "Синхронізація…",
    error: "Не вдалося синхронізувати Google Calendar.",
    unavailable: "Google Calendar поки недоступний для цього облікового запису.",
  },
  cs: {
    title: "Google Calendar",
    hint: "Rezervace v GO IRL zůstávají hlavní. Do Googlu se posílá jméno klienta, služba, čas a veřejné místo — bez telefonu klienta.",
    connect: "Připojit Google Calendar",
    connected: "Připojeno",
    disconnected: "Nepřipojeno",
    syncNow: "Synchronizovat nyní",
    disconnect: "Odpojit",
    lastSync: "Poslední synchronizace",
    never: "zatím neproběhla",
    busy: "Synchronizace…",
    error: "Google Calendar se nepodařilo synchronizovat.",
    unavailable: "Google Calendar zatím není pro tento účet dostupný.",
  },
  en: {
    title: "Google Calendar",
    hint: "GO IRL appointments stay canonical. Client name, service, time and public location are exported to Google — never the client phone number.",
    connect: "Connect Google Calendar",
    connected: "Connected",
    disconnected: "Not connected",
    syncNow: "Sync now",
    disconnect: "Disconnect",
    lastSync: "Last sync",
    never: "not yet",
    busy: "Syncing…",
    error: "Google Calendar sync failed.",
    unavailable: "Google Calendar is not available for this account yet.",
  },
} satisfies Record<Language, Record<string, string>>;

const requireCalendarApiConfig = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) throw new Error("google_calendar_env_missing");
  return { endpoint: `${supabaseUrl}/functions/v1/beautyGoogleCalendar`, publishableKey };
};

export async function requestBeautyGoogleCalendar(
  action: "status" | "connect" | "complete" | "sync" | "disconnect",
  payload: Record<string, unknown> = {},
): Promise<CalendarActionResponse> {
  const accessToken = await getTrustedAccessToken();
  if (!accessToken) throw new Error("trusted_session_required");
  const config = requireCalendarApiConfig();
  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json() as CalendarActionResponse;
  if (!response.ok || result.error) throw new Error(result.error || "google_calendar_request_failed");
  return result;
}

const dispatchStatusChanged = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(statusChangedEvent));
};

const cleanCalendarCallbackQuery = () => {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of callbackKeys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (changed) window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
};

export function BeautyGoogleCalendarLifecycle() {
  const completing = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state || completing.current) return;
    completing.current = true;
    void requestBeautyGoogleCalendar("complete", { code, state })
      .then(() => {
        cleanCalendarCallbackQuery();
        dispatchStatusChanged();
      })
      .catch(() => {
        cleanCalendarCallbackQuery();
        dispatchStatusChanged();
      })
      .finally(() => { completing.current = false; });
  }, []);

  return null;
}

export function BeautyGoogleCalendarSyncControl({ language }: { language: Language }) {
  const text = copy[language];
  const [status, setStatus] = useState<BeautyGoogleCalendarStatus>({
    connected: false,
    lastSyncedAt: null,
    lastErrorCode: null,
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const next = await requestBeautyGoogleCalendar("status");
      setStatus(next);
      setError("");
    } catch {
      setError(text.unavailable);
    } finally {
      setLoading(false);
    }
  }, [text.unavailable]);

  useEffect(() => {
    void refresh();
    const listener = () => { void refresh(); };
    window.addEventListener(statusChangedEvent, listener);
    return () => window.removeEventListener(statusChangedEvent, listener);
  }, [refresh]);

  const run = async (action: () => Promise<CalendarActionResponse>, errorText = text.error) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await action();
      if (typeof next.connected === "boolean") setStatus(next);
      dispatchStatusChanged();
    } catch {
      setError(errorText);
    } finally {
      setBusy(false);
    }
  };

  const connect = () => run(async () => {
    const result = await requestBeautyGoogleCalendar("connect");
    if (!result.authorizationUrl) throw new Error("google_calendar_authorization_url_missing");
    window.location.assign(result.authorizationUrl);
    return result;
  });

  const sync = () => run(() => requestBeautyGoogleCalendar("sync"));
  const disconnect = () => run(() => requestBeautyGoogleCalendar("disconnect"));

  return <section className="beauty-google-calendar-sync" aria-busy={loading || busy}>
    <div className="beauty-google-calendar-sync-head">
      <div><h3>{text.title}</h3><p>{text.hint}</p></div>
      <span className={status.connected ? "is-connected" : ""}>{status.connected ? text.connected : text.disconnected}</span>
    </div>
    {status.connected ? <>
      <button className="beauty-secondary beauty-google-calendar-sync-now" type="button" disabled={loading || busy} onClick={() => { void sync(); }}>{busy ? text.busy : text.syncNow}</button>
      <div className="beauty-google-calendar-meta"><span>{text.lastSync}: {status.lastSyncedAt ? new Intl.DateTimeFormat(localeByLanguage[language], { dateStyle: "medium", timeStyle: "short" }).format(new Date(status.lastSyncedAt)) : text.never}</span><button type="button" disabled={busy} onClick={() => { void disconnect(); }}>{text.disconnect}</button></div>
    </> : <button className="beauty-primary" type="button" disabled={loading || busy} onClick={() => { void connect(); }}>{text.connect}</button>}
    {error && <div className="beauty-errors"><span>{error}</span></div>}
  </section>;
}
