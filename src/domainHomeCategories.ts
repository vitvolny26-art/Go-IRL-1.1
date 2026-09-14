import { categories } from "./data";
import type { Category, Language } from "./types";

const beautyName: Record<Language, string> = {
  ru: "Уход за собой",
  uk: "Догляд за собою",
  cs: "Péče o sebe",
  en: "Grooming",
  pl: "Grooming",
  sk: "Péče o sebe",
};

const coachingName: Record<Language, string> = {
  ru: "Коучинг",
  uk: "Коучинг",
  cs: "Koučink",
  en: "Coaching",
  pl: "Coaching",
  sk: "Koučink",
};

const lessonsName: Record<Language, string> = {
  ru: "Обучение",
  uk: "Навчання",
  cs: "Lekce",
  en: "Lessons",
  pl: "Lessons",
  sk: "Lekce",
};

const serviceCategories = (): Category[] => {
  const beauty = categories.find((category) => category.id === "creativity");
  if (!beauty) return [];

  return [
    { ...beauty, name: beautyName },
    { id: "coaching", icon: "🧭", name: coachingName },
    { id: "lessons", icon: "🎓", name: lessonsName },
  ];
};

export const clientNavigationLabels: Record<Language, [string, string, string, string, string]> = {
  ru: ["Главная", "Для вас", "Каталог", "Мои записи", "Профиль"],
  uk: ["Головна", "Для вас", "Каталог", "Мої записи", "Профіль"],
  cs: ["Domů", "Pro vás", "Katalog", "Moje rezervace", "Profil"],
  en: ["Home", "For you", "Catalog", "My bookings", "Profile"],
  pl: ["Home", "For you", "Catalog", "My bookings", "Profile"],
  sk: ["Domů", "Pro vás", "Katalog", "Moje rezervace", "Profil"],
};

export const domainActionLabels: Record<Language, { create: string; professional: string }> = {
  ru: { create: "Создать", professional: "Кабинет мастера" },
  uk: { create: "Створити", professional: "Кабінет майстра" },
  cs: { create: "Vytvořit", professional: "Kabinet profesionála" },
  en: { create: "Create", professional: "Professional workspace" },
  pl: { create: "Create", professional: "Professional workspace" },
  sk: { create: "Vytvořit", professional: "Kabinet profesionála" },
};

export const homeCategoriesForPath = (pathname: string, _language: Language) => {
  void _language;
  if (pathname.replace(/\/+$/, "") !== "/services") return categories;
  return serviceCategories();
};
