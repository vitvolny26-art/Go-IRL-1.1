/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20260910131500_activ015_verified_organizer_badge_projection.sql", import.meta.url),
  "utf8",
);
const portal = readFileSync(new URL("./components/OrganizerProfilePortal.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./activ015-organizer-badge.css", import.meta.url), "utf8");

describe("Activ015 Verified Organizer badge", () => {
  it("projects only the approved global organizer role through a bounded boolean RPC", () => {
    expect(migration).toContain("public.go_irl_is_verified_organizer");
    expect(migration).toContain("role_assignment.role = 'organizer'");
    expect(migration).toContain("returns boolean");
    expect(migration).toContain("to authenticated");
    expect(migration).not.toContain("grant select on public.user_roles");
  });

  it("shows the localized badge only after the role projection resolves true", () => {
    expect(portal).toContain('supabase.rpc("go_irl_is_verified_organizer"');
    expect(portal).toContain('data === true');
    expect(portal).toContain('verifiedOrganizer ?');
    expect(portal).toContain('Проверенный организатор');
    expect(portal).toContain('Verified Organizer');
    expect(portal).toContain('ShieldCheck');
    expect(css).toContain('.organizer-profile-verified');
  });
});
