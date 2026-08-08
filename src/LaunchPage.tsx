const activityCardImage = "/launch/activity-card-user.webp";
const servicesCardImage = "/launch/services-card-user.webp?v=20260801-3";
import { useState } from "react";
import { beginFacebookWebAuth, beginGoogleWebAuth, isWebAuthProviderEnabled } from "./auth/googleWebAuth";
import { AppHeader } from "./components/AppHeader";
import { getTranslation } from "./i18n";
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

const copy = {
  ru: {
    description: "Выберите направление, найдите людей рядом и закройте телефон.", choose: "С чего начнём?", city: "Город", language: "Язык", activities: "Активности", activitiesInfo: "Встречайтесь, двигайтесь и проводите время вместе.", services: "Сервисы", servicesInfo: "Находите локальных специалистов и полезные услуги.", back: "Назад", placeholder: "Раздел будет добавлен следующим независимым шагом.", cityStatus: "Сейчас в городе", today: "Что делаем сегодня?", nearby: "ближайших", directions: "направления", urgent: "срочных", slogan: "Меньше скролла. Больше жизни.", google: "Войти через Google", googleError: "Не удалось начать вход через Google", facebook: "Войти через Facebook", facebookError: "Не удалось начать вход через Facebook",
  },
  uk: {
    description: "Оберіть напрямок, знайдіть людей поруч і закрийте телефон.", choose: "З чого почнемо?", city: "Місто", language: "Мова", activities: "Активності", activitiesInfo: "Зустрічайтеся, рухайтеся та проводьте час разом.", services: "Сервіси", servicesInfo: "Знаходьте локальних фахівців і корисні послуги.", back: "Назад", placeholder: "Розділ буде додано наступним незалежним кроком.", cityStatus: "Зараз у місті", today: "Що робимо сьогодні?", nearby: "найближчих", directions: "напрямки", urgent: "термінових", slogan: "Менше скролу. Більше життя.", google: "Увійти через Google", googleError: "Не вдалося почати вхід через Google", facebook: "Увійти через Facebook", facebookError: "Не вдалося почати вхід через Facebook",
  },
  cs: {
    description: "Vyberte směr, najděte lidi poblíž a odložte telefon.", choose: "Kde začneme?", city: "Město", language: "Jazyk", activities: "Aktivity", activitiesInfo: "Setkávejte se, hýbejte se a trávíte čas společně.", services: "Služby", servicesInfo: "Najděte místní specialisty a užitečné služby.", back: "Zpět", placeholder: "Tato část bude přidána v dalším samostatném kroku.", cityStatus: "Právě ve městě", today: "Co podnikneme dnes?", nearby: "nejbližší", directions: "směry", urgent: "naléhavé", slogan: "Méně scrollování. Více života.", google: "Přihlásit přes Google", googleError: "Přihlášení přes Google se nepodařilo spustit", facebook: "Přihlásit přes Facebook", facebookError: "Přihlášení přes Facebook se nepodařilo spustit",
  },
  en: {
    description: "Choose a direction, find people nearby, and put the phone away.", choose: "Where should we start?", city: "City", language: "Language", activities: "Activities", activitiesInfo: "Meet people, get moving, and spend time together.", services: "Services", servicesInfo: "Find local specialists and useful services.", back: "Back", placeholder: "This section will be added in the next independent step.", cityStatus: "Now in the city", today: "What are we doing today?", nearby: "nearby", directions: "directions", urgent: "urgent", slogan: "Less scrolling. More life.", google: "Continue with Google", googleError: "Could not start Google sign-in", facebook: "Continue with Facebook", facebookError: "Could not start Facebook sign-in",
  },
} satisfies Record<Language, Record<string, string>>;

export function LaunchPage({ language, selectedCityId, onLanguageChange, onCityChange, onOpenActivities, onOpenServices }: LaunchPageProps) {
  const t = copy[language];
  const [authError, setAuthError] = useState("");
  const showWebAuth = typeof window !== "undefined" && !getTelegramInitData();
  const showFacebookAuth = isWebAuthProviderEnabled("facebook");

  const startWebAuth = async (provider: "google" | "facebook") => {
    setAuthError("");
    try {
      if (provider === "facebook") await beginFacebookWebAuth();
      else await beginGoogleWebAuth();
    } catch {
      setAuthError(provider === "facebook" ? t.facebookError : t.googleError);
    }
  };

  return (
    <div className="launch-root launch-home">
      <AppHeader language={language} selectedCityId={selectedCityId} translation={getTranslation(language)} onBrandClick={() => undefined} onCityChange={onCityChange} onLanguageChange={onLanguageChange} />
      <main className="launch-content">
        {showWebAuth ? (
          <section className="launch-auth-row" aria-label={showFacebookAuth ? `${t.google} / ${t.facebook}` : t.google}>
            <button className="launch-google-auth" type="button" onClick={() => void startWebAuth("google")}>{t.google}</button>
            {showFacebookAuth ? <button className="launch-google-auth" type="button" onClick={() => void startWebAuth("facebook")}>{t.facebook}</button> : null}
            {authError ? <p className="launch-auth-error" role="alert">{authError}</p> : null}
          </section>
        ) : null}
        <section className="launch-domain-section" aria-label={t.choose}>
          <div className="launch-domain-grid">
            <button className="launch-domain-card launch-activities-card" type="button" onClick={onOpenActivities}>
              <img src={activityCardImage} alt="" aria-hidden="true" /><span className="launch-card-shade" aria-hidden="true" /><span className="launch-domain-copy"><strong>{t.activities}</strong><small>{t.activitiesInfo}</small></span>
            </button>
            <button className="launch-domain-card launch-services-card" type="button" onClick={onOpenServices}>
              <img src={servicesCardImage} alt="" aria-hidden="true" /><span className="launch-card-shade" aria-hidden="true" /><span className="launch-domain-copy"><strong>{t.services}</strong><small>{t.servicesInfo}</small></span>
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
