import { categories } from "./data";
import type { Language } from "./types";

const beautyName: Record<Language, string> = {
  ru: "Уход за собой",
  uk: "Догляд за собою",
  cs: "Péče o sebe",
  en: "Grooming",
};

export const clientNavigationLabels: Record<Language, [string, string, string, string, string]> = {
  ru: ["Главная", "Для вас", "Каталог", "Мои записи", "Профиль"],
  uk: ["Головна", "Для вас", "Каталог", "Мої записи", "Профіль"],
  cs: ["Domů", "Pro vás", "Katalog", "Moje rezervace", "Profil"],
  en: ["Home", "For you", "Catalog", "My bookings", "Profile"],
};

export const domainActionLabels: Record<Language, { create: string; professional: string }> = {
  ru: { create: "Создать", professional: "Кабинет мастера" },
  uk: { create: "Створити", professional: "Кабінет майстра" },
  cs: { create: "Vytvořit", professional: "Kabinet profesionála" },
  en: { create: "Create", professional: "Professional workspace" },
};

export const homeCategoriesForPath = (pathname: string, language: Language) => {
  if (pathname.replace(/\/+$/, "") !== "/services") return categories;

  return categories
    .filter((category) => category.id === "creativity")
    .map((category) => ({
      ...category,
      name: {
        ...category.name,
        [language]: beautyName[language],
      },
    }));
};
