const activityCardImage = "/launch/activity-card-user.webp";
const servicesCardImage = "/launch/services-card-user.webp?v=20260801-3";
import { useEffect, useMemo, useState } from "react";
import { beginFacebookWebAuth, beginGoogleWebAuth, isWebAuthProviderEnabled } from "./auth/googleWebAuth";
import { isTrustedAuthReady } from "./authSession";
import { AppHeader } from "./components/AppHeader";
import { prepareCanonicalGuestAppRuntime } from "./guestAppRuntime";
import { getTranslation } from "./i18n";
import { isCanonicalWebGuest } from "./launchSurface";
import { loadPublicActivityPreviews, type PublicActivityPreview } from "./publicActivityPreviews";
import { loadProfessionalDirectory, type ServicesProfessional } from "./services/servicesProfessionalDirectory";
import { getTelegramInitData } from "./telegram";
import type { Language } from "./types";
import "./launch-page.css";

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
    choose: "С чего начнём?", activities: "Активности", activitiesInfo: "Встречайтесь, двигайтесь и проводите время вместе.", services: "Сервисы", servicesInfo: "Находите локальных специалистов и полезные услуги.", telegram: "Открыть в Telegram", google: "Google", googleError: "Не удалось начать вход через Google", facebook: "Facebook", facebookError: "Не удалось начать вход через Facebook", authRequired: "Войдите, чтобы продолжить", authLegal: "Вход через выбранного провайдера использует его аккаунт для подтверждения вашей личности в GO IRL. Провайдер также обрабатывает данные по своим правилам.", terms: "Условия использования", privacy: "Конфиденциальность", liveEvents: "Актуальные события", masters: "Мастера", readOnly: "Войдите, чтобы открыть карточку и действовать", loading: "Загрузка…", emptyEvents: "Актуальных событий пока нет", emptyMasters: "Мастеров пока нет", free: "Бесплатно",
  },
  uk: {
    choose: "З чого почнемо?", activities: "Активності", activitiesInfo: "Зустрічайтеся, рухайтеся та проводьте час разом.", services: "Сервіси", servicesInfo: "Знаходьте локальних фахівців і корисні послуги.", telegram: "Відкрити в Telegram", google: "Google", googleError: "Не вдалося почати вхід через Google", facebook: "Facebook", facebookError: "Не вдалося почати вхід через Facebook", authRequired: "Увійдіть, щоб продовжити", authLegal: "Вхід через обраного провайдера використовує його акаунт для підтвердження вашої особи в GO IRL. Провайдер також обробляє дані за власними правилами.", terms: "Умови використання", privacy: "Конфіденційність", liveEvents: "Актуальні події", masters: "Майстри", readOnly: "Увійдіть, щоб відкрити картку та діяти", loading: "Завантаження…", emptyEvents: "Актуальних подій поки немає", emptyMasters: "Майстрів поки немає", free: "Безкоштовно",
  },
  cs: {
    choose: "Kde začneme?", activities: "Aktivity", activitiesInfo: "Setkávejte se, hýbejte se a trávíte čas společně.", services: "Služby", servicesInfo: "Najděte místní specialisty a užitečné služby.", telegram: "Otevřít v Telegramu", google: "Google", googleError: "Přihlášení přes Google se nepodařilo spustit", facebook: "Facebook", facebookError: "Přihlášení přes Facebook se nepodařilo spustit", authRequired: "Pro pokračování se přihlaste", authLegal: "Přihlášením přes vybraného poskytovatele použijete jeho účet k ověření své identity pro GO IRL. Poskytovatel zpracovává údaje také podle svých vlastních podmínek.", terms: "Podmínky používání", privacy: "Ochrana osobních údajů", liveEvents: "Aktuální události", masters: "Profesionálové", readOnly: "Přihlaste se pro otevření karty a akce", loading: "Načítání…", emptyEvents: "Aktuálně nejsou žádné události", emptyMasters: "Zatím žádní profesionálové", free: "Zdarma",
  },
  en: {
    choose: "Where should we start?", activities: "Activities", activitiesInfo: "Meet people, get moving, and spend time together.", services: "Services", servicesInfo: "Find local specialists and useful services.", telegram: "Open in Telegram", google: "Google", googleError: "Could not start Google sign-in", facebook: "Facebook", facebookError: "Could not start Facebook sign-in", authRequired: "Sign in to continue", authLegal: "Signing in with a provider uses that account to verify your identity for GO IRL. The provider also processes data under its own terms.", terms: "Terms of Use", privacy: "Privacy", liveEvents: "Current events", masters: "Professionals", readOnly: "Sign in to open cards and take action", loading: "Loading…", emptyEvents: "No current events yet", emptyMasters: "No professionals yet", free: "Free",
  },
} satisfies Record<Language, Record<string, string>>;

export function LaunchPage({ language, selectedCityId, onLanguageChange, onCityChange, onOpenActivities, onOpenServices }: LaunchPageProps) {
  const t = copy[language];
  const [authError, setAuthError] = useState("");
  const [activities, setActivities] = useState<PublicActivityPreview[]>([]);
  const [professionals, setProfessionals] = useState<ServicesProfessional[]>([]);
  const [previewLoading, setPreviewLoading] = useState(true);
  const showWebAuth = typeof window !== "undefined" && !getTelegramInitData() && !isTrustedAuthReady();
  const showFacebookAuth = isWebAuthProviderEnabled("facebook");

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

  const eventDateFormatter = useMemo(() => new Intl.DateTimeFormat(language === "cs" ? "cs-CZ" : language === "uk" ? "uk-UA" : language === "ru" ? "ru-RU" : "en-GB", { day: "numeric", month: "short" }), [language]);

  const startWebAuth = async (provider: "google" | "facebook") => {
    setAuthError("");
    try {
      if (provider === "facebook") await beginFacebookWebAuth();
      else await beginGoogleWebAuth();
    } catch {
      setAuthError(provider === "facebook" ? t.facebookError : t.googleError);
    }
  };

  const openDomain = (openApp: () => void) => {
    const guest = isCanonicalWebGuest();
    openApp();
    if (guest) prepareCanonicalGuestAppRuntime();
  };

  return (
    <div className="launch-root launch-home">
      <AppHeader language={language} selectedCityId={selectedCityId} translation={getTranslation(language)} onBrandClick={() => undefined} onCityChange={onCityChange} onLanguageChange={onLanguageChange} />
      <main className="launch-content">
        {showWebAuth ? (
          <section className="guest-app-auth-strip" style={{ position: "static", transform: "none", margin: "8px auto 12px" }} aria-label={t.authRequired}>
            <a className="guest-app-auth-button telegram" href={telegramEntryUrl()}>{t.telegram}</a>
            <button className="guest-app-auth-button" type="button" onClick={() => void startWebAuth("google")}>{t.google}</button>
            <button className="guest-app-auth-button" type="button" disabled={!showFacebookAuth} onClick={() => void startWebAuth("facebook")}>{t.facebook}</button>
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
            <button className="launch-domain-card launch-services-card" type="button" onClick={() => openDomain(onOpenServices)}>
              <img src={servicesCardImage} alt="" aria-hidden="true" /><span className="launch-card-shade" aria-hidden="true" /><span className="launch-domain-copy"><strong>{t.services}</strong><small>{t.servicesInfo}</small></span>
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