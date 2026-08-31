import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CircleUserRound, Compass, Heart, MapPin, Save, Search, Sparkles } from "lucide-react";
import { getCurrentAuthIdentity, getCurrentUserKey } from "../authSession";
import { cities, getCity } from "../config/cities";
import { getTranslation } from "../i18n";
import { createProfileRepository } from "../profile/profileRepository";
import { readServicesClientPreferences } from "../profile/profileVerticalPreferences";
import { useServicesClientPreferences } from "../profile/profileVerticalPreferencesHooks";
import { useAppStore } from "../store";
import { supabase } from "../supabase";
import { getTelegramWebApp } from "../telegram";
import type { Language } from "../types";
import { markBeautyDeepLinkFocusHandled, pendingBeautyDeepLinkFocusSlug } from "./beautyDeepLink";
import { loadProfessionalDirectory, type ServicesProfessional } from "./servicesProfessionalDirectory";
import { manicureArtwork } from "./serviceArtwork";
import { ServiceActivityCard } from "./ServiceActivityCard";
import { servicesPreferenceLabel } from "./servicesPreferenceLabels";
import {
  loadServicesClientProfileProjection,
  saveServicesClientProfileProjection,
  type ServicesClientProfileProjection,
} from "./servicesClientProfileProjection";
import "./services-client.css";
import "./service-artwork.css";

type DirectoryState = "loading" | "ready" | "empty" | "error";

const preferenceOptions = ["Маникюр", "Волосы", "Брови и ресницы", "Массаж", "Уход за лицом"];

const servicesFallbackDisplayName = (language: Language) => {
  const user = getTelegramWebApp()?.initDataUnsafe?.user;
  return [user?.first_name, user?.last_name].filter(Boolean).join(" ") || getTranslation(language).guestName;
};

const copy = {
  ru: { forYou: "Для вас", forYouHint: "По предпочтениям в профиле", catalog: "Все мастера", profile: "Профиль клиента", name: "Имя", preferences: "Предпочтения", save: "Сохранить", saved: "Сохранено", saveError: "Не удалось сохранить профиль", empty: "Подходящих мастеров пока нет", catalogEmpty: "В выбранном городе пока нет мастеров", loading: "Загружаем мастеров…", error: "Каталог мастеров временно недоступен" },
  uk: { forYou: "Для вас", forYouHint: "За вподобаннями у профілі", catalog: "Усі майстри", profile: "Профіль клієнта", name: "Ім’я", preferences: "Вподобання", save: "Зберегти", saved: "Збережено", saveError: "Не вдалося зберегти профіль", empty: "Відповідних майстрів поки немає", catalogEmpty: "У вибраному місті поки немає майстрів", loading: "Завантажуємо майстрів…", error: "Каталог майстрів тимчасово недоступний" },
  cs: { forYou: "Pro vás", forYouHint: "Podle preferencí v profilu", catalog: "Všichni profesionálové", profile: "Profil klienta", name: "Jméno", preferences: "Preference", save: "Uložit", saved: "Uloženo", saveError: "Profil se nepodařilo uložit", empty: "Zatím žádní odpovídající profesionálové", catalogEmpty: "Ve vybraném městě zatím nejsou profesionálové", loading: "Načítáme profesionály…", error: "Katalog profesionálů je dočasně nedostupný" },
  en: { forYou: "For you", forYouHint: "Based on your profile preferences", catalog: "All professionals", profile: "Client profile", name: "Name", preferences: "Preferences", save: "Save", saved: "Saved", saveError: "Could not save profile", empty: "No matching professionals yet", catalogEmpty: "No professionals in the selected city yet", loading: "Loading professionals…", error: "The professional directory is temporarily unavailable" },
} satisfies Record<Language, Record<string, string>>;

function useProfessionalDirectory(cityId: string, language: Language) {
  const [professionals, setProfessionals] = useState<ServicesProfessional[]>([]);
  const [state, setState] = useState<DirectoryState>("loading");
  useEffect(() => {
    let active = true;
    setState("loading");
    void loadProfessionalDirectory(cityId, language)
      .then((items) => {
        if (!active) return;
        setProfessionals(items);
        setState(items.length ? "ready" : "empty");
      })
      .catch(() => {
        if (!active) return;
        setProfessionals([]);
        setState("error");
      });
    return () => { active = false; };
  }, [cityId, language]);
  return { professionals, state };
}

function ProfessionalCards({ professionals, state, empty, loading, error, language, artworkVariant = "share" }: {
  professionals: ServicesProfessional[];
  state: DirectoryState;
  empty: string;
  loading: string;
  error: string;
  language: Language;
  artworkVariant?: "share" | "card" | "sheet";
}) {
  if (state !== "ready") {
    const message = state === "loading" ? loading : state === "error" ? error : empty;
    return <div className="services-client-empty"><Heart /><span>{message}</span></div>;
  }
  const groups = Array.from(professionals.reduce((map, professional) => {
    const current = map.get(professional.profileId) || [];
    current.push(professional);
    map.set(professional.profileId, current);
    return map;
  }, new Map<string, ServicesProfessional[]>()).values());
  return <div className="services-professional-grid">{groups.map(([professional, ...serviceOptions]) => <div data-beauty-slug={professional.slug} style={{ display: "contents" }} key={professional.profileId}><ServiceActivityCard professional={professional} serviceOptions={serviceOptions} language={language} artworkVariant={artworkVariant} /></div>)}</div>;
}

function ProfessionalSection({ title, professionals, language, artworkVariant = "share" }: { title: string; professionals: ServicesProfessional[]; language: Language; artworkVariant?: "share" | "card" | "sheet" }) {
  if (!professionals.length) return null;
  return <section className="discover-section"><div className="section-title"><h2>{title}</h2></div><ProfessionalCards professionals={professionals} state="ready" empty="" loading="" error="" language={language} artworkVariant={artworkVariant} /></section>;
}

export function ServicesForYouView({ language, selectedCityId }: { language: Language; selectedCityId: string }) {
  const userKey = getCurrentUserKey();
  const preferences = useServicesClientPreferences(userKey);
  const { professionals, state } = useProfessionalDirectory(selectedCityId, language);
  const text = copy[language];
  const [locationState, setLocationState] = useState<"idle" | "ready" | "blocked">("idle");
  const deepLinkEntry = useMemo(() => {
    if (typeof window === "undefined") return { pathname: "", search: "", slug: "" };
    const pathname = window.location.pathname;
    const search = window.location.search;
    return { pathname, search, slug: pendingBeautyDeepLinkFocusSlug(pathname, search) };
  }, []);
  const targetSlug = deepLinkEntry.slug;
  const focusCityResolutionHandled = useRef<string | null>(null);
  const focusedScrollHandled = useRef<string | null>(null);
  const [focusResolved, setFocusResolved] = useState(false);
  const focusedProfessional = targetSlug
    ? professionals.find((professional) => professional.slug === targetSlug) || null
    : null;
  const baseInterestMatches = useMemo(() => professionals.filter((professional) => preferences.length === 0 || preferences.some((preference) => professional.serviceName.toLowerCase().includes(preference.toLowerCase()))), [preferences, professionals]);
  const interestSectionProfessionals = useMemo(() => {
    const normalRows = baseInterestMatches.slice(0, 8);
    if (!focusedProfessional) return normalRows;
    const focusedRows = professionals.filter((professional) => professional.profileId === focusedProfessional.profileId);
    return [
      ...focusedRows,
      ...normalRows.filter((professional) => professional.profileId !== focusedProfessional.profileId),
    ];
  }, [baseInterestMatches, focusedProfessional, professionals]);
  const labels = language === "ru"
    ? { search: "Найти мастера или услугу", filters: "Быстрые фильтры", matched: "Подходит вам", interests: "По вашим интересам", nearest: "Ближайшие мастера", newest: "Новые мастера", nearMe: "Рядом со мной", location: "Включить геолокацию", blocked: "Не удалось получить геолокацию" }
    : language === "uk"
      ? { search: "Знайти майстра або послугу", filters: "Швидкі фільтри", matched: "Підходить вам", interests: "За вашими інтересами", nearest: "Найближчі майстри", newest: "Нові майстри", nearMe: "Поруч зі мною", location: "Увімкнути геолокацію", blocked: "Не вдалося отримати геолокацію" }
      : language === "cs"
        ? { search: "Najít profesionála nebo službu", filters: "Rychlé filtry", matched: "Pro vás", interests: "Podle vašich zájmů", nearest: "Nejbližší profesionálové", newest: "Noví profesionálové", nearMe: "V mém okolí", location: "Povolit polohu", blocked: "Polohu se nepodařilo získat" }
        : { search: "Find a professional or service", filters: "Quick filters", matched: "Matched for you", interests: "Based on your interests", nearest: "Nearest professionals", newest: "New professionals", nearMe: "Near me", location: "Enable location", blocked: "Location is unavailable" };
  const newest = [...professionals].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);

  useEffect(() => {
    if (!targetSlug) return undefined;
    return () => markBeautyDeepLinkFocusHandled(deepLinkEntry.pathname, deepLinkEntry.search, targetSlug);
  }, [deepLinkEntry.pathname, deepLinkEntry.search, targetSlug]);

  useEffect(() => {
    if (!targetSlug || focusResolved || state === "loading" || focusedProfessional || focusCityResolutionHandled.current === targetSlug) return undefined;
    focusCityResolutionHandled.current = targetSlug;
    let active = true;
    void Promise.all(cities
      .filter((city) => city.id !== selectedCityId)
      .map(async (city) => {
        try {
          const items = await loadProfessionalDirectory(city.id, language);
          return items.find((professional) => professional.slug === targetSlug) || null;
        } catch {
          return null;
        }
      }))
      .then((matches) => {
        if (!active) return;
        const match = matches.find((candidate): candidate is ServicesProfessional => Boolean(candidate));
        if (match && match.cityId !== selectedCityId) useAppStore.getState().setSelectedCity(match.cityId);
      });
    return () => { active = false; };
  }, [focusResolved, focusedProfessional, language, selectedCityId, state, targetSlug]);

  useEffect(() => {
    if (!targetSlug || state !== "ready" || !focusedProfessional || focusedScrollHandled.current === targetSlug) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const marker = Array.from(document.querySelectorAll<HTMLElement>(".services-for-you-view [data-beauty-slug]"))
        .find((element) => element.dataset.beautySlug === targetSlug);
      const card = marker?.querySelector<HTMLElement>("article.unified-event-card");
      if (!card) return;
      focusedScrollHandled.current = targetSlug;
      markBeautyDeepLinkFocusHandled(deepLinkEntry.pathname, deepLinkEntry.search, targetSlug);
      setFocusResolved(true);
      card.scrollIntoView({ block: "center", inline: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [deepLinkEntry.pathname, deepLinkEntry.search, focusedProfessional, state, targetSlug]);

  const enableLocation = () => {
    if (!navigator.geolocation) return setLocationState("blocked");
    navigator.geolocation.getCurrentPosition(() => setLocationState("ready"), () => setLocationState("blocked"), { maximumAge: 300000, timeout: 5000 });
  };
  return <section className="page-section services-client-view services-for-you-view discover-page">
    <div className="page-title"><Sparkles /><div><h1>{text.forYou}</h1><p>{text.forYouHint}</p></div></div>
    {state !== "ready" ? <ProfessionalCards professionals={[]} state={state} empty={text.empty} loading={text.loading} error={text.error} language={language} /> : <>
      <div className="services-for-you-card-artwork-alt"><ProfessionalSection title={labels.interests} professionals={interestSectionProfessionals} language={language} artworkVariant="sheet" /></div>
      <ProfessionalSection title={labels.nearest} professionals={professionals.slice(0, 8)} language={language} artworkVariant="sheet" />
      <ProfessionalSection title={labels.newest} professionals={newest} language={language} artworkVariant="sheet" />
      <section className="discover-section"><div className="section-title discover-section-title"><MapPin /><h2>{labels.nearMe}</h2>{locationState === "idle" && <button onClick={enableLocation} type="button">{labels.location}</button>}</div>{locationState === "blocked" && <div className="nearby-note">{labels.blocked}</div>}{locationState === "ready" && <ProfessionalCards professionals={professionals.slice(0, 8)} state="ready" empty={text.empty} loading={text.loading} error={text.error} language={language} artworkVariant="sheet" />}</section>
    </>}
  </section>;
}

export function ServicesCatalogView({ language, selectedCityId }: { language: Language; selectedCityId: string }) {
  const { professionals, state } = useProfessionalDirectory(selectedCityId, language);
  const city = getCity(selectedCityId);
  const text = copy[language];
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const labels = language === "ru"
    ? { search: "Найти мастера или услугу", filters: "Фильтры" }
    : language === "uk"
      ? { search: "Знайти майстра або послугу", filters: "Фільтри" }
      : language === "cs"
        ? { search: "Najít profesionála nebo službu", filters: "Filtry" }
        : { search: "Find a professional or service", filters: "Filters" };
  const matched = useMemo(() => professionals.filter((professional) => `${professional.displayName} ${professional.serviceName} ${professional.publicLocation}`.toLowerCase().includes(query.trim().toLowerCase()) && activeFilters.every((filter) => professional.serviceName.toLowerCase().includes(filter.toLowerCase()))), [activeFilters, professionals, query]);
  const matchedState = state === "ready" && !matched.length ? "empty" : state;
  const toggleFilter = (filter: string) => setActiveFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]);

  return <section className="page-section services-client-view services-catalog-view discover-page">
    <div className="page-title"><Compass /><div><h1>{text.catalog}</h1><p>{city.name[language]}</p></div></div>
    <label className="discover-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={labels.search} /></label>
    <div className="discover-filter-block"><span>{labels.filters}</span><div className="filter-row discover-filters">{preferenceOptions.map((filter) => <button className={activeFilters.includes(filter) ? "filter active" : "filter"} key={filter} onClick={() => toggleFilter(filter)} type="button">{filter === "Маникюр" && <img className="service-filter-icon" src={manicureArtwork.icon} alt="" />}{servicesPreferenceLabel(filter, language)}</button>)}</div></div>
    <ProfessionalCards professionals={matched} state={matchedState} empty={text.catalogEmpty} loading={text.loading} error={text.error} language={language} />
  </section>;
}

export function ServicesClientProfileView({ language, selectedCityId }: { language: Language; selectedCityId: string }) {
  const fallbackDisplayName = servicesFallbackDisplayName(language);
  const identity = getCurrentAuthIdentity();
  const identityKey = getCurrentUserKey();
  const repository = useMemo(() => createProfileRepository({
    identity,
    supabaseClient: supabase,
    storage: localStorage,
    fallbackDisplayName,
    fallbackCityId: selectedCityId,
  }), [fallbackDisplayName, identityKey, selectedCityId]);
  const [profile, setProfile] = useState<ServicesClientProfileProjection>(() => ({
    name: fallbackDisplayName,
    preferences: readServicesClientPreferences(localStorage, identityKey),
  }));
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profileError, setProfileError] = useState(false);
  const city = getCity(selectedCityId);
  const text = copy[language];

  useEffect(() => {
    let active = true;
    setProfileError(false);
    void loadServicesClientProfileProjection({ repository, storage: localStorage, userKey: identityKey, fallbackDisplayName })
      .then((loaded) => { if (active) setProfile(loaded); })
      .catch(() => { if (active) setProfileError(true); });
    return () => { active = false; };
  }, [fallbackDisplayName, identityKey, repository]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = { name: String(data.get("name") || "").trim(), preferences: data.getAll("preferences").map(String) };
    setSaving(true);
    setSaved(false);
    setProfileError(false);
    try {
      const savedProfile = await saveServicesClientProfileProjection({
        repository,
        storage: localStorage,
        userKey: identityKey,
        fallbackDisplayName,
        fallbackCityId: selectedCityId,
        profile: next,
      });
      setProfile(savedProfile);
      setSaved(true);
    } catch {
      setProfileError(true);
    } finally {
      setSaving(false);
    }
  };
  return <section className="page-section services-client-view"><div className="page-title"><CircleUserRound /><div><h1>{text.profile}</h1><p>{city.name[language]}</p></div></div><form className="services-client-profile" onSubmit={submit}><label><span>{text.name}</span><input key={profile.name} name="name" defaultValue={profile.name} /></label><fieldset><legend>{text.preferences}</legend>{preferenceOptions.map((option) => <label key={option}><input type="checkbox" name="preferences" value={option} defaultChecked={profile.preferences.includes(option)} /><span>{option}</span></label>)}</fieldset>{profileError && <div role="alert">{text.saveError}</div>}<button type="submit" disabled={saving}><Save />{saved ? text.saved : text.save}</button></form></section>;
}
