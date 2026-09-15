import { describe, expect, it } from "vitest";
import { cinestarCzAdapter } from "./cinestar-cz.js";
import {
  parseCineStarDiscountPromotionForTest,
  withCineStarPromotions,
} from "./cinestar-promotions.js";
import type { CinemaFetchedPage, CinemaRawSnapshotPayload, CinemaSourceConfig } from "../cinema-ingestion-types.js";

const source: CinemaSourceConfig = {
  id: "00000000-0000-0000-0000-000000000011",
  venue_id: "00000000-0000-0000-0000-000000000012",
  source_id: "cinestar_cz",
  adapter_key: "cinestar_cz",
  source_url: "https://cinestar.cz/cz/olomouc/",
  fetch_method: "html",
  parser_version: "1.0.0",
  timezone: "Europe/Prague",
  enabled: false,
  fetch_interval_minutes: 1440,
  expected_horizon_days: 1,
  min_records: 1,
  config: {},
};

const promotionPage: CinemaFetchedPage = {
  url: "https://cinestar.cz/cz/olomouc/akce/kino-dny-v-cinestar",
  status: 200,
  body: `
    <html><body>
      <h1>Kino dny v CineStar</h1>
      <p>19. a 20. září 2026 si užijete filmy za 100 Kč.</p>
      <p>Navíc získáte slevy na vybrané občerstvení.</p>
    </body></html>
  `,
};

describe("CineStar discount promotions", () => {
  it("extracts a real date-range discount promotion", () => {
    const promotion = parseCineStarDiscountPromotionForTest(
      promotionPage,
      "2026-09-15T10:00:00.000Z",
    );

    expect(promotion).toMatchObject({
      title: "Kino dny v CineStar",
      start_date: "2026-09-19",
      end_date: "2026-09-20",
      all_day: true,
      promo_price: 100,
      currency: "CZK",
      source_url: promotionPage.url,
    });
    expect(promotion?.discount_text).toContain("100 Kč");
  });

  it("ignores ordinary special-program pages without a discount signal", () => {
    const page = {
      ...promotionPage,
      url: "https://cinestar.cz/cz/olomouc/akce/opera-v-kine",
      body: "<h1>Opera v kině</h1><p>20. září 2026 speciální projekce.</p>",
    };
    expect(parseCineStarDiscountPromotionForTest(page, "2026-09-15T10:00:00.000Z")).toBeNull();
  });

  it("keeps promotion parsing auxiliary to screening scope authority", () => {
    const adapter = withCineStarPromotions(cinestarCzAdapter);
    const payload: CinemaRawSnapshotPayload = {
      adapter_key: "cinestar_cz",
      fetched_at: "2026-09-15T10:00:00.000Z",
      root_url: "https://cinestar.cz/cz/olomouc/filmy",
      failures: [],
      pages: [
        {
          url: "https://cinestar.cz/cz/olomouc/filmy",
          status: 200,
          body: "<a href='/cz/olomouc/filmy/movie/10688-magicka-posedlost-2'>Film</a>",
        },
        {
          url: "https://cinestar.cz/cz/olomouc/filmy/movie/10688-magicka-posedlost-2",
          status: 200,
          body: `
            <h1>Magická posedlost 2 TITULKY</h1>
            <div>130 min.</div>
            <div>15. 9. 2026</div>
            <div>STANDARD</div>
            <div>TITULKY</div>
            <button data-performance-id="99002">18:00</button>
          `,
        },
        promotionPage,
      ],
    };

    const parsed = adapter.parseSnapshot(source, payload);
    expect(parsed.scope_complete).toBe(true);
    expect(parsed.records_valid).toBe(1);
    expect(parsed.records_rejected).toBe(0);
    expect(parsed.metrics.discount_promotions).toEqual([
      expect.objectContaining({ title: "Kino dny v CineStar", promo_price: 100 }),
    ]);
  });
});
