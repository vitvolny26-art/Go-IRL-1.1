import type { Language } from "../types";
import type { BeautyShareCardLifecycleStatus, BeautyShareCardStatus } from "./beautyShareCardStatus";

const localeByLanguage: Record<Language, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  cs: "cs-CZ",
  en: "en-GB",
  pl: "en-GB",
  sk: "cs-CZ",
};

const copy: Record<Language, Record<BeautyShareCardLifecycleStatus | "loading" | "unavailable", string>> = {
  ru: {
    ready: "● Визитка готова",
    updating: "◌ Визитка обновляется…",
    error: "⚠ Не удалось обновить",
    deleted: "— Визитка удалена",
    loading: "Загружаем статус визитки…",
    unavailable: "Статус визитки недоступен",
  },
  uk: {
    ready: "● Візитка готова",
    updating: "◌ Візитка оновлюється…",
    error: "⚠ Не вдалося оновити",
    deleted: "— Візитка видалена",
    loading: "Завантажуємо статус візитки…",
    unavailable: "Статус візитки недоступний",
  },
  cs: {
    ready: "● Vizitka je připravena",
    updating: "◌ Vizitka se aktualizuje…",
    error: "⚠ Aktualizace se nezdařila",
    deleted: "— Vizitka byla odstraněna",
    loading: "Načítáme stav vizitky…",
    unavailable: "Stav vizitky není dostupný",
  },
  en: {
    ready: "● Business card ready",
    updating: "◌ Business card updating…",
    error: "⚠ Update failed",
    deleted: "— Business card deleted",
    loading: "Loading business-card status…",
    unavailable: "Business-card status unavailable",
  },
  pl: {
    ready: "● Business card ready",
    updating: "◌ Business card updating…",
    error: "⚠ Update failed",
    deleted: "— Business card deleted",
    loading: "Loading business-card status…",
    unavailable: "Business-card status unavailable",
  },
  sk: {
    ready: "● Vizitka je připravena",
    updating: "◌ Vizitka se aktualizuje…",
    error: "⚠ Aktualizace se nezdařila",
    deleted: "— Vizitka byla odstraněna",
    loading: "Načítáme stav vizitky…",
    unavailable: "Stav vizitky není dostupný",
  },
};

export const beautyShareCardStaffStatusCopy = (
  language: Language,
  key: BeautyShareCardLifecycleStatus | "loading" | "unavailable",
) => copy[language][key];

export const formatBeautyShareCardStaffStatus = (
  status: BeautyShareCardStatus,
  language: Language,
) => {
  const label = copy[language][status.status];
  if (status.status !== "ready" || !status.generatedAt) return label;
  const generatedTime = new Intl.DateTimeFormat(localeByLanguage[language], {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(status.generatedAt));
  return `${label} · ${generatedTime}`;
};
