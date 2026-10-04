import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../supabase/migrations/20261004143000_kino000b_source_registry_health.sql", import.meta.url),
  "utf8",
);

describe("Kino000B source registry migration safety", () => {
  it("adds only a read-only health projection and never activates monitoring", () => {
    expect(migration).toContain("create or replace view public.cinema_source_registry_health_v");
    expect(migration).toContain("health_status");
    expect(migration).toContain("monitoring_requested");
    expect(migration).not.toMatch(/update\s+public\.cinema_sources\s+set\s+enabled\s*=\s*true/i);
    expect(migration).not.toMatch(/update\s+public\.cinema_venues\s+set\s+monitor_enabled\s*=\s*true/i);
  });
});
