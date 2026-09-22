import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260922143000_afishi007_city_posters_manual_dispatch.sql", import.meta.url),
  "utf8",
);

describe("AFISHI007 City Posters manual publication dispatcher", () => {
  it("is bounded to an explicit unique set of publishable events", () => {
    expect(migration).toContain("p_event_ids uuid[]");
    expect(migration).toContain("city_posters_event_ids_required");
    expect(migration).toContain("city_posters_event_ids_must_be_unique");
    expect(migration).toContain("event.status = 'published'");
    expect(migration).toContain("event.hero_media_url is not null");
    expect(migration).toContain("city_posters_events_not_publishable");
    expect(migration).toContain("city_posters_active_publication_exists");
  });

  it("keeps service-role credentials inside Vault and bypasses the broken Vercel worker-secret hop", () => {
    expect(migration).toContain("vault.decrypted_secrets");
    expect(migration).toContain("secret.name = 'service_role_key'");
    expect(migration).toContain("functions/v1/telegramEventSupergroup");
    expect(migration).toContain("'action', 'maintain_city_poster_publications'");
    expect(migration).not.toContain("go-irl-1-1.vercel.app/api/city-posters/maintenance");
    expect(migration).not.toContain("go_irl_reminder_worker_secret");
  });

  it("is callable only by service_role", () => {
    expect(migration).toContain("revoke all on function public.go_irl_dispatch_city_posters_publication(uuid[])");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("grant execute on function public.go_irl_dispatch_city_posters_publication(uuid[])");
    expect(migration).toContain("to service_role");
  });
});
