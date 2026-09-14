import { describe, expect, it } from "vitest";
import { ShareTemplateService, buildActivityShareText } from "./share";
import { formatShareLocation } from "./share/share-model-builder";
import type { Activity } from "./types";

const activity: Activity = {
  id: "share-1",
  type: "sport",
  categoryId: "sport",
  activity: { ru: "🏐 Волейбол", uk: "🏐 Волейбол", cs: "🏐 Volejbal", en: "🏐 Volleyball" , pl: "🏐 Volleyball", sk: "🏐 Volejbal"},
  title: { ru: "Пляжный волейбол", uk: "Пляжний волейбол", cs: "Beach volejbal", en: "Beach volleyball" , pl: "Beach volleyball", sk: "Beach volejbal"},
  description: { ru: "Играем вечером", uk: "Граємо ввечері", cs: "Hrajeme večer", en: "Evening game" , pl: "Evening game", sk: "Hrajeme večer"},
  date: "2026-07-08",
  time: "18:00",
  cityId: "olomouc",
  address: "Beach Arena",
  price: 120,
  capacity: 8,
  participants: 6,
  members: [],
  organizer: "Vit",
  organizerKey: "owner",
  visibility: "public",
  metadata: {
    sport: {
      durationMinutes: 90,
    },
  },
};

describe("buildActivityShareText", () => {
  it("creates a friendly localized invitation with event facts and CTA", () => {
    const text = buildActivityShareText(activity, "ru", 0);

    expect(text).toContain("👋 Привет!");
    expect(text).toContain("В среду собираемся поиграть в волейбол.");
    expect(text).toContain("📍 Оломоуц, Beach Arena");
    expect(text).toContain("🕕 18:00–19:30");
    expect(text).toContain("💰 120 Kč");
    expect(text).toContain("👥 Осталось мест: 2");
    expect(text).toContain("👉 Присоединиться");
    expect(text).not.toContain("https://t.me/GOirl_bot?startapp=share-1");
    expect(text).toContain("GO IRL");
    expect(text).not.toContain("Меньше скролла. Больше жизни.");
  });

  it("supports English templates through the same architecture", () => {
    const text = buildActivityShareText(activity, "en", 1);

    expect(text).toContain("On Wednesday, we're getting together for volleyball.");
    expect(text).toContain("📍 Olomouc, Beach Arena");
    expect(text).toContain("👉 Join");
    expect(text).not.toContain("Less scrolling. More life.");
  });

  it("uses activity-specific human phrasing instead of one generic template", () => {
    const variants: Array<[Activity["activity"], string]> = [
      [{ ru: "🛼 Ролики", uk: "🛼 Ролики", cs: "🛼 Inline bruslení", en: "🛼 Inline skating" , pl: "🛼 Inline skating", sk: "🛼 Inline bruslení"}, "едем кататься на роликах"],
      [{ ru: "☕ Кофе", uk: "☕ Кава", cs: "☕ Káva", en: "☕ Coffee" , pl: "☕ Coffee", sk: "☕ Káva"}, "собираемся выпить кофе"],
      [{ ru: "🥾 Поход", uk: "🥾 Похід", cs: "🥾 Výlet", en: "🥾 Hiking" , pl: "🥾 Hiking", sk: "🥾 Výlet"}, "идём в небольшой поход"],
      [{ ru: "🚴 Велосипед", uk: "🚴 Велосипед", cs: "🚴 Kolo", en: "🚴 Cycling" , pl: "🚴 Cycling", sk: "🚴 Kolo"}, "едем кататься на велосипедах"],
      [{ ru: "🎲 Настолки", uk: "🎲 Настільні ігри", cs: "🎲 Deskové hry", en: "🎲 Board games" , pl: "🎲 Board games", sk: "🎲 Deskové hry"}, "собираемся поиграть в настольные игры"],
      [{ ru: "🎾 Теннис", uk: "🎾 Теніс", cs: "🎾 Tenis", en: "🎾 Tennis" , pl: "🎾 Tennis", sk: "🎾 Tenis"}, "играем в теннис"],
      [{ ru: "🏃 Бег", uk: "🏃 Біг", cs: "🏃 Běh", en: "🏃 Running" , pl: "🏃 Running", sk: "🏃 Běh"}, "идём на совместную пробежку"],
    ];

    for (const [activityName, expected] of variants) {
      expect(
        buildActivityShareText(
          {
            ...activity,
            activity: activityName,
            title: activityName,
            description: { ru: "Описание", uk: "Опис", cs: "Popis", en: "Description" , pl: "Description", sk: "Popis"},
          },
          "ru",
          0,
        ),
      ).toContain(expected);
    }
  });

  it("does not combine two different cities in the location line", () => {
    const text = buildActivityShareText({ ...activity, cityId: "olomouc", address: "Прага" }, "ru", 0);

    expect(text).toContain("📍 Прага");
    expect(text).not.toContain("Оломоуц, Прага");
  });

  it("formats share location safely for city-only, place-only, and city-place cases", () => {
    expect(formatShareLocation("praha", "", "ru")).toBe("Прага");
    expect(formatShareLocation("", "парк Летна", "ru")).toBe("парк Летна");
    expect(formatShareLocation("praha", "парк Летна", "ru")).toBe("Прага, парк Летна");
  });

  it("does not duplicate the same city or merge conflicting cities", () => {
    expect(formatShareLocation("praha", "Прага, парк Летна", "ru")).toBe("Прага, парк Летна");
    expect(formatShareLocation("olomouc", "Прага", "ru")).toBe("Прага");
    expect(formatShareLocation("brno", "Praha", "en")).toBe("Praha");
  });

  it("combines city and place only when they belong together", () => {
    const text = buildActivityShareText({ ...activity, cityId: "praha", address: "парк Летна" }, "ru", 0);

    expect(text).toContain("📍 Прага, парк Летна");
  });

  it("uses only the city when the place is empty or duplicates the city", () => {
    const emptyPlace = buildActivityShareText({ ...activity, cityId: "praha", address: "" }, "ru", 0);
    const cityAsPlace = buildActivityShareText({ ...activity, cityId: "praha", address: "Прага" }, "ru", 0);

    expect(emptyPlace).toContain("📍 Прага");
    expect(cityAsPlace).toContain("📍 Прага");
    expect(cityAsPlace).not.toContain("Прага, Прага");
  });

  it("keeps all template variants human and non-promotional", () => {
    const forbidden = [
      "Будет живо",
      "без бесконечного скролла",
      "Не пропусти",
      "Лучшее событие",
      "Самое крутое",
      "Уникальная возможность",
      "Зарядись эмоциями",
      "Незабываемый вечер",
      "endless scrolling",
      "Plan unlocked",
    ];
    const texts = (["ru", "uk", "cs", "en", "pl", "sk"] as const).flatMap((language) =>
      [0, 1, 2].map((index) => buildActivityShareText(activity, language, index)),
    );

    for (const text of texts) {
      for (const phrase of forbidden) {
        expect(text).not.toContain(phrase);
      }
    }
  });

  it("places a plain-text URL below the CTA and never as the first line", () => {
    const url = "https://t.me/GOirl_bot?startapp=share-1";
    const text = ShareTemplateService.buildPlainText(activity, "ru", url, 0);
    const lines = text.split("\n");

    expect(lines[0]).not.toBe(url);
    expect(lines).toContain("👉 Присоединиться:");
    expect(lines[lines.indexOf("👉 Присоединиться:") + 1]).toBe(url);
    expect(lines.at(-1)).toBe("GO IRL");
    expect(text).not.toContain("Меньше скролла. Больше жизни.");
  });

  it("localizes the plain-text CTA before the URL", () => {
    const url = "https://t.me/GOirl_bot?startapp=share-1";

    expect(ShareTemplateService.buildPlainText(activity, "uk", url, 0)).toContain("👉 Приєднатися:\nhttps://t.me/GOirl_bot?startapp=share-1");
    expect(ShareTemplateService.buildPlainText(activity, "cs", url, 0)).toContain("👉 Připojit se:\nhttps://t.me/GOirl_bot?startapp=share-1");
    expect(ShareTemplateService.buildPlainText(activity, "en", url, 0)).toContain("👉 Join:\nhttps://t.me/GOirl_bot?startapp=share-1");
  });
});
