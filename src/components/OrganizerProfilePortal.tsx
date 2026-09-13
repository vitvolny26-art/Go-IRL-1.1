import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, Heart, LoaderCircle, MapPin, ShieldCheck, Star, X, Zap } from "lucide-react";
import { getCurrentAuthIdentity, initializeTrustedAuth, readAuthUserKey } from "../authSession";
import { stripLeadingEmoji } from "../cardText";
import { getCity } from "../config/cities";
import { formatEventTime } from "../eventTime";
import { createOrganizerFavoritesRepository } from "../favorites/organizerFavoritesRepository";
import { localeByLanguage } from "../i18n";
import { useAppStore } from "../store";
import { supabase } from "../supabase";
import type { Language } from "../types";
import "../activ015-organizer-badge.css";
import { isOrganizerAvatarImage, organizerProfileEventName, type OrganizerProfileDetail } from "./EventCardPrimitives";

const copy: Record<Language, { title: string; events: string; activeEvents: string; organizedEvents: string; noEvents: string; close: string; addFavorite: string; removeFavorite: string; favoriteError: string; authRequired: string; verifiedOrganizer: string }> = {
  ru: { title: "Профиль организатора", events: "Всего событий", activeEvents: "Активные", organizedEvents: "События организатора", noEvents: "Опубликованных событий пока нет", close: "Закрыть", addFavorite: "Добавить в избранное", removeFavorite: "Убрать из избранного", favoriteError: "Не удалось изменить избранное", authRequired: "Нужна авторизация", verifiedOrganizer: "Проверенный организатор" },
  uk: { title: "Профіль організатора", events: "Усього подій", activeEvents: "Активні", organizedEvents: "Події організатора", noEvents: "Опублікованих подій поки немає", close: "Закрити", addFavorite: "Додати в обране", removeFavorite: "Прибрати з обраного", favoriteError: "Не вдалося змінити обране", authRequired: "Потрібна авторизація", verifiedOrganizer: "Перевірений організатор" },
  cs: { title: "Profil organizátora", events: "Všechny události", activeEvents: "Aktivní", organizedEvents: "Události organizátora", noEvents: "Zatím žádné zveřejněné události", close: "Zavřít", addFavorite: "Přidat do oblíbených", removeFavorite: "Odebrat z oblíbených", favoriteError: "Oblíbené se nepodařilo změnit", authRequired: "Je vyžadováno přihlášení", verifiedOrganizer: "Ověřený organizátor" },
  en: { title: "Organizer profile", events: "Total events", activeEvents: "Active", organizedEvents: "Organizer events", noEvents: "No published events yet", close: "Close", addFavorite: "Add to favorites", removeFavorite: "Remove from favorites", favoriteError: "Could not update favorites", authRequired: "Authentication required", verifiedOrganizer: "Verified Organizer" },
};

const eventDateLabel = (date: string, time: string, language: Language) => {
  const dateLabel = new Intl.DateTimeFormat(localeByLanguage[language], { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
  const timeLabel = formatEventTime(time);
  return timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel;
};

const trustedUserKey = () => {
  const identity = getCurrentAuthIdentity();
  return identity?.source === "trusted-telegram" || identity?.source === "trusted-provider" ? readAuthUserKey(identity) : null;
};

export function OrganizerProfilePortal() {
  const { activities, language } = useAppStore();
  const [profile, setProfile] = useState<OrganizerProfileDetail | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [favoriteMessage, setFavoriteMessage] = useState("");
  const [verifiedOrganizer, setVerifiedOrganizer] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const favoriteRequestRef = useRef(0);
  const verificationRequestRef = useRef(0);
  const events = useMemo(() => profile ? activities.filter((item) => item.organizerKey === profile.organizerKey && item.visibility === "public") : [], [activities, profile]);
  const sortedEvents = useMemo(() => [...events].sort((left, right) => `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`)), [events]);
  const activeEvents = useMemo(() => { const today = new Date().toISOString().slice(0, 10); return events.filter((event) => event.date >= today).length; }, [events]);
  const ownProfile = Boolean(profile && trustedUserKey() === profile.organizerKey);

  const closeProfile = useCallback(() => {
    favoriteRequestRef.current += 1; verificationRequestRef.current += 1; setProfile(null); setFavorite(false); setFavoriteLoading(false); setFavoritePending(false); setFavoriteMessage(""); setVerifiedOrganizer(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    const open = (event: Event) => { const detail = (event as CustomEvent<OrganizerProfileDetail>).detail; if (!detail?.organizerKey) return; triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setProfile(detail); setFavorite(false); setFavoriteMessage(""); setVerifiedOrganizer(false); };
    window.addEventListener(organizerProfileEventName, open); return () => window.removeEventListener(organizerProfileEventName, open);
  }, []);

  useEffect(() => {
    if (!profile) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") closeProfile(); };
    document.addEventListener("keydown", onKeyDown); return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeProfile, profile]);

  useEffect(() => {
    if (!profile) return;
    const requestId = verificationRequestRef.current + 1;
    verificationRequestRef.current = requestId;
    setVerifiedOrganizer(false);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("go_irl_is_verified_organizer", { p_user_key: profile.organizerKey });
        if (verificationRequestRef.current === requestId && !error) setVerifiedOrganizer(data === true);
      } catch {
        // Badge projection is non-critical; profile remains usable if unavailable.
      }
    })();
    return () => { if (verificationRequestRef.current === requestId) verificationRequestRef.current += 1; };
  }, [profile]);

  useEffect(() => {
    if (!profile || ownProfile) return; const userKey = trustedUserKey(); if (!userKey) return;
    const requestId = favoriteRequestRef.current + 1; favoriteRequestRef.current = requestId; setFavoriteLoading(true); setFavoriteMessage("");
    const repository = createOrganizerFavoritesRepository(supabase, userKey);
    void repository.load(profile.organizerKey).then((state) => { if (favoriteRequestRef.current === requestId) setFavorite(state.isFavorite); }).catch(() => { if (favoriteRequestRef.current === requestId) setFavoriteMessage(copy[language].favoriteError); }).finally(() => { if (favoriteRequestRef.current === requestId) setFavoriteLoading(false); });
  }, [language, ownProfile, profile]);

  const toggleFavorite = async () => {
    if (!profile || favoritePending || favoriteLoading || ownProfile) return;
    let userKey = trustedUserKey();
    if (!userKey) {
      const identity = await initializeTrustedAuth();
      userKey = identity?.source === "trusted-telegram" || identity?.source === "trusted-provider" ? readAuthUserKey(identity) : null;
    }
    if (!userKey) { setFavoriteMessage(copy[language].authRequired); return; }
    const previous = favorite; const next = !previous; setFavorite(next); setFavoritePending(true); setFavoriteMessage("");
    try { const state = await createOrganizerFavoritesRepository(supabase, userKey).set(profile.organizerKey, next); setFavorite(state.isFavorite); }
    catch { setFavorite(previous); setFavoriteMessage(copy[language].favoriteError); }
    finally { setFavoritePending(false); }
  };

  if (!profile || typeof document === "undefined") return null;
  const labels = copy[language]; const fallbackCityId = events[0]?.cityId || ""; const cityId = profile.cityId || fallbackCityId; const city = cityId ? getCity(cityId).name[language] : "";

  return createPortal(
    <div className="organizer-profile-backdrop" role="presentation" onClick={closeProfile}>
      <section className="organizer-profile-sheet" role="dialog" aria-modal="true" aria-label={labels.title} onClick={(event) => event.stopPropagation()}>
        <button className="organizer-profile-close" type="button" aria-label={labels.close} onClick={closeProfile}><X aria-hidden="true" /></button>
        <header className="organizer-profile-header"><div className="organizer-profile-avatar-large">{isOrganizerAvatarImage(profile.avatar) ? <img src={profile.avatar} alt="" /> : <span>{profile.avatar}</span>}</div><div className="organizer-profile-header-copy"><small>{labels.title}</small><h2>{profile.displayName}</h2>{verifiedOrganizer ? <div className="organizer-profile-verified" aria-label={labels.verifiedOrganizer}><ShieldCheck aria-hidden="true" /><span>{labels.verifiedOrganizer}</span></div> : null}{city ? <p><MapPin aria-hidden="true" />{city}</p> : null}</div></header>
        {!ownProfile ? <div className="organizer-profile-favorite-wrap"><button className={`organizer-profile-favorite${favorite ? " is-active" : ""}`} type="button" aria-pressed={favorite} disabled={favoriteLoading || favoritePending} onClick={() => void toggleFavorite()}>{favoriteLoading || favoritePending ? <LoaderCircle className="organizer-profile-favorite-spinner" aria-hidden="true" /> : <Heart aria-hidden="true" />}<span>{favorite ? labels.removeFavorite : labels.addFavorite}</span></button>{favoriteMessage ? <p className="organizer-profile-favorite-message" role="status">{favoriteMessage}</p> : null}</div> : null}
        {profile.bio ? <p className="organizer-profile-bio">{profile.bio}</p> : null}
        <div className="organizer-profile-stats"><div><Star aria-hidden="true" /><strong>{events.length}</strong><span>{labels.events}</span></div><div><Zap aria-hidden="true" /><strong>{activeEvents}</strong><span>{labels.activeEvents}</span></div></div>
        <section className="organizer-profile-events-section"><h3>{labels.organizedEvents}</h3>{sortedEvents.length ? <div className="organizer-profile-events">{sortedEvents.map((activity) => <article className="organizer-profile-event" key={activity.id}><CalendarDays aria-hidden="true" /><div><strong>{stripLeadingEmoji(activity.title[language])}</strong><span>{eventDateLabel(activity.date, activity.time, language)}</span><small>{getCity(activity.cityId).name[language]}</small></div></article>)}</div> : <p className="organizer-profile-empty">{labels.noEvents}</p>}</section>
      </section>
    </div>, document.body,
  );
}
