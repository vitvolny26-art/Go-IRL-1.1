import { describe, expect, it } from "vitest";
import { buildTelegramCityPostersCard, type TrustedCityPostersShareCard } from "../../../api/_shared/telegram-share-city-posters";

describe("SHARE020 City Posters Telegram photo contract", () => {
  it("uses the controlled Telegram media endpoint even when the event has external hero media", () => {
    const card: TrustedCityPostersShareCard = {
      eventId: "event-1",
      canonicalSlug: "burger-street-festival",
      title: "Burger Street Festival Olomouc",
      description: "Festival",
      date: "2 Oct, 10:00",
      venue: "Galerie Šantovka",
      detailsUrl: "https://t.me/GOirl_bot?startapp=city-poster-burger-street-festival",
      appUrl: "https://go-irl.fun/offers?event=burger-street-festival",
      vertical: "festivals",
    heroMediaUrl: "https://external.example/festival.jpg",
      language: "ru",
    };
    const controlledMediaUrl = "https://go-irl-1-1.vercel.app/api/telegram/city-posters-share-card?slug=burger-street-festival&language=ru";

    const result = buildTelegramCityPostersCard(card, controlledMediaUrl);

    expect(result.type).toBe("photo");
    expect(result.photo_url).toBe(controlledMediaUrl);
    expect(result.thumbnail_url).toBe(controlledMediaUrl);
    expect(result.photo_url).not.toBe(card.heroMediaUrl);
  });
});
