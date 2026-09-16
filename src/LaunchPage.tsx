const activityCardImage = "/launch/activity-card-user.webp";
const servicesCardImage = "/launch/services-card-user.webp?v=20260801-3";
const cityPostersCardImage = "/activities/share-4x3/22-festival.webp";
import { useEffect, useMemo, useRef, useState } from "react";
import { beginFacebookWebAuth, beginGoogleWebAuth } from "./auth/googleWebAuth";
import { isTrustedAuthReady } from "./authSession";
import { AppHeader } from "./components/AppHeader";
import { prepareCanonicalGuestAppRuntime } from "./guestAppRuntime";
import { getTranslation, localeByLanguage } from "./i18n";
import { isCanonicalWebGuest } from "./launchSurface";
import { loadPublicActivityPreviews, type PublicActivityPreview } from "./publicActivityPreviews";
import { loadProfessionalDirectory, type ServicesProfessional } from "./services/servicesProfessionalDirectory";
import { getTelegramInitData } from "./telegram";
import type { Language } from "./types";
import "./launch-page.css";
import "./city-posters/launch-card.css";

type LaunchPageProps = {
  language: Language;
  selectedCityId: string;
  onLanguageChange: (language: Language) => void;
  onCityChange: (cityId: string) => void;
  onOpenActivities: () => void;
  onOpenServices: () => void;
};

const telegramBotUsername = String(import.meta.env.VITE_GO_IRL_BOT_USERNAME || "GOirl_bot").replace(/^@/, "");
const telegramAppName = String(import.meta.env.VITE_GO_IRL_APP_NAME || "").replace(/^\/+|\/+$/g, "");
const telegramEntryUrl = () => `https://t.me/${telegramBotUsername}${telegramAppName ? `/${telegramAppName}` : ""}`;

const copy = {
  ru: {
    choose: "С чего начнём?", activities: "Активности", activitiesInfo: "Встречайтесь, двигайтесь и проводите время вместе.", services: "Сервисы", servicesInfo: "Находите локальных специалистов и полезные услуги.", afisa: "Афиша", afisaInfo: "Кино, концерты, фестивали, спорт и другие события города.", offers: "Акции и бонусы", offersInfo: "Скидки, бонусы и специальные предложения рядом.", inDevelopment: "В разработке", telegram: "Открыть в Telegram", google: "Google", googleError: "Не удалось начать вход через Google", facebook: "Facebook", facebookError: "Не удалось начать вход через Facebook", authRequired: "Войдите, чтобы продолжить", authLegal: "Вход через выбранного провайдера использует его аккаунт для подтверждения вашей личности в GO IRL. Провайдер также обрабатывает данные по своим правилам.", terms: "Условия использования", privacy: "Конфиденциальность", liveEvents: "Актуальные события", masters: "Мастера", readOnly: "Войдите, чтобы открыть карточку и действовать", loading: "Загрузка…", emptyEvents: "Актуальных событий пока нет", emptyMasters: "Мастеров пока нет", free: "Бесплатно",
  },
  uk: {
    choose: "З чого почнемо?", activities: "Активності", activitiesInfo: "Зустрічайтеся, рухайтеся та проводьте час разом.", services: "Сервіси", servicesInfo: "Знаходьте локальних фахівців і корисні послуги.", afisa: "Афіша", afisaInfo: "Кіно, концерти, фестивалі, спорт та інші події міста.", offers: "Акції та бонуси", offersInfo: "Знижки, бонуси та спеціальні пропозиції поруч.", inDevelopment: "У розробці", telegram: "Відкрити в Telegram", google: "Google", googleError: "Не вдалося почати вхід через Google", facebook: "Facebook", facebookError: "Не вдалося почати вхід через Facebook", authRequired: "Увійдіть, щоб продовжити", authLegal: "Вхід через обраного провайдера використовує його акаунт для підтвердження вашої особи в GO IRL. Провайдер також обробляє дані за власними правилами.", terms: "Умови використання", privacy: "Конфіденційність", liveEvents: "Актуальні події", masters: "Майстри", readOnly: "Увійдіть, щоб відкрити картку та діяти", loading: "Завантаження…", emptyEvents: "Актуальних подій поки немає", emptyMasters: "Майстрів поки немає", free: "Безкоштовно",
  },
  cs: {
    choose: "Kde začneme?", activities: "Aktivity", activitiesInfo: "Setkávejte se, hýbejte se a trávíte čas společně.", services: "Služby", servicesInfo: "Najděte místní specialisty a užitečné služby.", afisa: "Program města", afisaInfo: "Kino, koncerty, festivaly, sport a další městské akce.", offers: "Akce a bonusy", offersInfo: "Slevy, bonusy a speciální nabídky ve vašem okolí.", inDevelopment: "Ve vývoji", telegram: "Otevřít v Telegramu", google: "Google", googleError: "Přihlášení přes Google se nepodařilo spustit", facebook: "Facebook", facebookError: "Přihlášení přes Facebook se nepodařilo spustit", authRequired: "Pro pokračování se přihlaste", authLegal: "Přihlášením přes vybraného poskytovatele použijete jeho účet k ověření své identity pro GO IRL. Poskytovatel zpracovává údaje také podle svých vlastních podmínek.", terms: "Podmínky používání", privacy: "Ochrana osobních údajů", liveEvents: "Aktuální události", masters: "Profesionálové", readOnly: "Přihlaste se pro otevření karty a akce", loading: "Načítání…", emptyEvents: "Aktuálně nejsou žádné události", emptyMasters: "Zatím žádní profesionálové", free: "Zdarma",
  },
  en: {
    choose: "Where should we start?", activities: "Activities", activitiesInfo: "Meet people, get moving, and spend time together.", services: "Services", servicesInfo: "Find local specialists and useful services.", afisa: "City Posters", afisaInfo: "Cinema, concerts, festivals, sport and other city events.", offers: "Deals & bonuses", offersInfo: "Discounts, bonuses and special offers near you.", inDevelopment: "In development", telegram: "Open in Telegram", google: "Google", googleError: "Could not start Google sign-in", facebook: "Facebook", facebookError: "Could not start Facebook sign-in", authRequired: "Sign in to continue", authLegal: "Signing in with a provider uses that account to verify your identity for GO IRL. The provider also processes data under its own terms.", terms: "Terms of Use", privacy: "Privacy", liveEvents: "Current events", masters: "Professionals", readOnly: "Sign in to open cards and take action", loading: "Loading…", emptyEvents: "No current events yet", emptyMasters: "No professionals yet", free: "Free",
  },
  pl: {
    choose: "Od czego zaczynamy?", activities: "Aktywności", activitiesInfo: "Spotykaj się z ludźmi, ruszaj się i spędzaj czas razem.", services: "Usługi", servicesInfo: "Znajdź lokalnych specjalistów i przydatne usługi.", afisa: "Program miasta", afisaInfo: "Kino, koncerty, festiwale, sport i inne wydarzenia w mieście.", offers: "Promocje i bonusy", offersInfo: "Zniżki, bonusy i specjalne oferty w pobliżu.", inDevelopment: "W przygotowaniu", telegram: "Otwórz w Telegramie", google: "Google", googleError: "Nie udało się rozpocząć logowania przez Google", facebook: "Facebook", facebookError: "Nie udało się rozpocząć logowania przez Facebook", authRequired: "Zaloguj się, aby kontynuować", authLegal: "Logowanie przez wybranego dostawcę używa jego konta do potwierdzenia Twojej tożsamości w GO IRL. Dostawca przetwarza dane również na własnych zasadach.", terms: "Warunki korzystania", privacy: "Prywatność", liveEvents: "Aktualne wydarzenia", masters: "Specjaliści", readOnly: "Zaloguj się, aby otwierać karty i wykonywać działania", loading: "Ładowanie…", emptyEvents: "Brak aktualnych wydarzeń", emptyMasters: "Brak specjalistów", free: "Bezpłatnie",
  },
  sk: {
    choose: "Kde začneme?", activities: "Aktivity", activitiesInfo: "Stretávajte sa, hýbte sa a trávte čas spolu.", services: "Služby", servicesInfo: "Nájdite miestnych odborníkov a užitočné služby.", afisa: "Program mesta", afisaInfo: "Kino, koncerty, festivaly, šport a ďalšie mestské podujatia.", offers: "Akcie a bonusy", offersInfo: "Zľavy, bonusy a špeciálne ponuky vo vašom okolí.", inDevelopment: "Vo vývoji", telegram: "Otvoriť v Telegrame", google: "Google", googleError: "Nepodarilo sa spustiť prihlásenie cez Google", facebook: "Facebook", facebookError: "Nepodarilo sa spustiť prihlásenie cez Facebook", authRequired: "Prihláste sa a pokračujte", authLegal: "Prihlásenie cez vybraného poskytovateľa používa jeho účet na overenie vašej identity pre GO IRL. Poskytovateľ spracúva údaje aj podľa vlastných podmienok.", terms: "Podmienky používania", privacy: "Ochrana súkromia", liveEvents: "Aktuálne podujatia", masters: "Odborníci", readOnly: "Prihláste sa, aby ste mohli otvárať karty a vykonávať akcie", loading: "Načítavanie…", emptyEvents: "Zatiaľ nie sú žiadne aktuálne podujatia", emptyMasters: "Zatiaľ nie sú žiadni odborníci", free: "Zadarmo",
  },
} satisfies Record<Language, Record<string, string>>;

export function LaunchPage({ language, selectedCityId, onLanguageChange, onCityChange, onOpenActivities, onOpenServices }: LaunchPageProps) {
  const t = copy[language];
  const [authError, setAuthError] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const authInFlightRef = useRef(false);
  const [activities, setActivities] = useState<PublicActivityPreview[]>([]);
  const [professionals, setProfessionals] = useState<ServicesProfessional[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  const showWebAuth = typeof window !== "undefined" && !getTelegramInitData() && !isTrustedAuthReady();

  useEffect(() => {
    let active = true;
    setPreviewLoading(true);
    void Promise.allSettled([
      loadPublicActivityPreviews(selectedCityId, language),
      loadProfessionalDirectory(selectedCityId, language, { browserMock: false }),
    ]).then(([activityResult, professionalResult]) => {
      if (!active) return;
      setActivities(activityResult.status === "fulfilled" ? activityResult.value : []);
      const nextProfessionals = professionalResult.status === "fulfilled" ? professionalResult.value : [];
      setProfessionals(Array.from(new Map(nextProfessionals.map((item) => [item.profileId, item])).values()).slice(0, 4));
    }).finally(() => {
      if (active) setPreviewLoading(false);
    });
    return () => { active = false; };
  }, [language, selectedCityId]);

  const eventDateFormatter = useMemo(() => new Intl.DateTimeFormat(localeByLanguage[language], { day: "numeric", month: "short" }), [language]);

  const startWebAuth = async (provider: "google" | "facebook") => {
    if (authInFlightRef.current) return;
    authInFlightRef.current = true;
    setAuthPending(true);
    setAuthError("");
    try {
      if (provider === "facebook") await beginFacebookWebAuth();
      else await beginGoogleWebAuth();
    } catch {
      authInFlightRef.current = false;
      setAuthPending(false);
      setAuthError(provider === "facebook" ? t.facebookError : t.googleError);
    }
  };

  const openDomain = (openApp: () => void) => {
    const guest = isCanonicalWebGuest();
    openApp();
    if (guest) prepareCanonicalGuestAppRuntime();
  };

  const authActions = showWebAuth ? (
    <div className="guest-header-auth-actions" aria-label={t.authRequired}>
      <a className="guest-app-auth-button telegram" href={telegramEntryUrl()}>{t.telegram}</a>
      <button className="guest-app-auth-button" type="button" disabled={authPending} onClick={() => void startWebAuth("google")}>{t.google}</button>
      <small className="guest-app-auth-status" role={authError ? "alert" : undefined}>{authError}</small>
    </div>
  ) : null;

  return (
    <div className="launch-root launch-home">
      <AppHeader language={language} selectedCityId={selectedCityId} translation={getTranslation(language)} authSlot={authActions} onBrandClick={() => undefined} onCityChange={onCityChange} onLanguageChange={onLanguageChange} />
      <main className="launch-content">
        {showWebAuth ? (
          <section className="guest-app-auth-strip launch-mobile-auth-strip" aria-label={t.authRequired}>
            <a className="guest-app-auth-button telegram" href={telegramEntryUrl()}>{t.telegram}</a>
            <button className="guest-app-auth-button" type="button" disabled={authPending} onClick={() => void startWebAuth("google")}>{t.google}</button>
            <small className="guest-app-auth-legal">
              {t.authLegal} <a href={`/terms.html?lang=${language}`}>{t.terms}</a>
              {" · "}<a href={`/privacy.html?lang=${language}`}>{t.privacy}</a>
            </small>
            <small className="guest-app-auth-status" role={authError ? "alert" : undefined}>{authError}</small>
          </section>
        ) : null}

        <section className="launch-domain-section" aria-label={t.choose}>
          <div className="launch-domain-grid">
            <button className="launch-domain-card launch-activities-card" type="button" onClick={() => openDomain(onOpenActivities)}>
              <img src={activityCardImage} alt="" aria-hidden="true" /><span className="launch-card-shade" aria-hidden="true" /><span className="launch-domain-copy"><strong>{t.activities}</strong><small>{t.activitiesInfo}</small></span>
            </button>
            <button className="launch-domain-card launch-city-posters-card" type="button" onClick={() => window.location.assign("/city-posters")}>
              <img src={cityPostersCardImage} alt="" aria-hidden="true" /><span className="launch-card-shade" aria-hidden="true" /><span className="launch-domain-copy"><strong>{t.afisa}</strong><small>{t.afisaInfo}</small></span>
            </button>
            <button className="launch-domain-card launch-services-card" type="button" onClick={() => openDomain(onOpenServices)}>
              <img src={servicesCardImage} alt="" aria-hidden="true" /><span className="launch-card-shade" aria-hidden="true" /><span className="launch-domain-copy"><strong>{t.services}</strong><small>{t.servicesInfo}</small></span>
            </button>
            <button className="launch-domain-card launch-offers-card" type="button" disabled>
              <span className="launch-offers-art" aria-hidden="true"><strong>%</strong><small>2+1</small></span>
              <span className="launch-card-shade" aria-hidden="true" />
              <span className="launch-development-badge">{t.inDevelopment}</span>
              <span className="launch-domain-copy"><strong>{t.offers}</strong><small>{t.offersInfo}</small></span>
            </button>
          </div>
        </section>

        <section className="launch-preview-section" id="launch-events-preview" aria-label={t.liveEvents}>
          <div className="launch-preview-heading"><h2>{t.liveEvents}</h2><small>{t.readOnly}</small></div>
          {previewLoading ? <p className="launch-preview-empty">{t.loading}</p> : activities.length ? <div className="launch-preview-grid">{activities.map((activity) => <article className="launch-preview-card" key={activity.id} aria-disabled="true">
            <strong>{activity.title}</strong>
            <span>{eventDateFormatter.format(new Date(`${activity.date}T12:00:00`))} · {activity.time}</span>
            <small>{activity.address}</small>
            <b>{activity.price > 0 ? `${activity.price} CZK` : t.free}</b>
          </article>)}</div> : <p className="launch-preview-empty">{t.emptyEvents}</p>}
        </section>

        <section className="launch-preview-section" id="launch-masters-preview" aria-label={t.masters}>
          <div className="launch-preview-heading"><h2>{t.masters}</h2><small>{t.readOnly}</small></div>
          {previewLoading ? <p className="launch-preview-empty">{t.loading}</p> : professionals.length ? <div className="launch-preview-grid">{professionals.map((professional) => <article className="launch-preview-card" key={professional.profileId} aria-disabled="true">
            <strong>{professional.displayName}</strong>
            <span>{professional.serviceName}</span>
            <small>{professional.publicLocation}</small>
            <b>{professional.priceCzk} {professional.currency}</b>
          </article>)}</div> : <p className="launch-preview-empty">{t.emptyMasters}</p>}
        </section>
      </main>
    </div>
  );
}
