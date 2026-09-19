import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260919123000_akce001b_cinema_promotions_city_posters.sql", import.meta.url),
  "utf8",
);
const publication = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/cityPostersPublication.ts", import.meta.url),
  "utf8",
);

describe("Akce001B cinema promotion City Posters materialization", () => {
  it("materializes only selected promotions after an approval becomes applied", () => {
    expect(migration).toContain("city_posters_materialize_cinema_promotions");
    expect(migration).toContain("and selected = true");
    expect(migration).toContain("new.status = 'applied'");
    expect(migration).toContain("after update of status on public.cinema_publication_approvals");
  });

  it("writes the canonical Event, Czech translation, occurrence and official offer idempotently", () => {
    expect(migration).toContain("insert into public.city_posters_events");
    expect(migration).toContain("on conflict (city_id, canonical_slug) do update");
    expect(migration).toContain("insert into public.city_posters_event_translations");
    expect(migration).toContain("metadata->>'cinemaPromotionKey'");
    expect(migration).toContain("insert into public.city_posters_occurrences");
    expect(migration).toContain("insert into public.city_posters_offers");
    expect(migration).toContain("'available', true, true");
  });

  it("keeps source dates authoritative and lets Telegram discover already-active date ranges", () => {
    expect(migration).toContain("v_promo.start_date::timestamp");
    expect(migration).toContain("(v_promo.end_date + 1)::timestamp");
    expect(publication).toContain('.gte("ends_at",now)');
  });

  it("does not create legacy Activities or synthetic customer data", () => {
    expect(migration).not.toContain("insert into public.activities");
    expect(migration).not.toContain("app_users");
  });
});
