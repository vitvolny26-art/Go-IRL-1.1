import { describe, expect, it } from "vitest";
import { categories } from "./data";
import { clientNavigationLabels, domainActionLabels, homeCategoriesForPath } from "./domainHomeCategories";

describe("homeCategoriesForPath", () => {
  it("keeps the activities category grid unchanged", () => {
    expect(homeCategoriesForPath("/activities", "ru")).toBe(categories);
  });

  it("returns Beauty, Coaching and Lessons for Services", () => {
    const serviceCategories = homeCategoriesForPath("/services", "ru");

    expect(serviceCategories.map((category) => category.id)).toEqual(["creativity", "coaching", "lessons"]);
    expect(serviceCategories[0]?.name.ru).toBe("Уход за собой");
    expect(serviceCategories[1]?.name.ru).toBe("Коучинг");
    expect(serviceCategories[2]?.name.ru).toBe("Обучение");
    expect(homeCategoriesForPath("/services", "uk")[2]?.name.uk).toBe("Навчання");
    expect(homeCategoriesForPath("/services", "cs")[1]?.name.cs).toBe("Koučink");
    expect(homeCategoriesForPath("/services", "en").map((category) => category.name.en)).toEqual(["Grooming", "Coaching", "Lessons"]);
  });

  it("defines the service-specific Russian navigation", () => {
    expect(clientNavigationLabels.ru).toEqual(["Главная", "Для вас", "Каталог", "Мои записи", "Профиль"]);
  });

  it("defines domain actions independently from elevated roles", () => {
    expect(domainActionLabels.ru).toEqual({ create: "Создать", professional: "Кабинет мастера" });
  });
});
