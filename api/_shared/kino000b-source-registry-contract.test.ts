import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const worker = source("./cinema-ingestion-worker.ts");
const register = source("./cinema-adapters/register.ts");
const registry = source("./cinema-source-registry.ts");
const migration = source("../../supabase/migrations/20261004143000_kino000b_cinema_source_registry_contract.sql");

describe("Kino000B source registry contract", () => {
  it("keeps activation controlled by source + venue flags and registered worker adapters", () => {
    expect(worker).toContain('.eq("enabled", true)');
    expect(worker).toContain('.eq("cinema_venues.active", true)');
    expect(worker).toContain('.eq("cinema_venues.monitor_enabled", true)');
    expect(worker).toContain("registeredCinemaAdapterKeys");
    expect(worker).toContain("adapter_unregistered");
    expect(worker).toContain("source_registry_invalid");
  });

  it("registers the currently implemented Olomouc chain adapters and leaves unknown adapters fail-closed", () => {
    expect(register).toContain("premiere-cz");
    expect(register).toContain("cinestar-cz");
    expect(register).toContain("cinemax-cz");
    expect(registry).toContain('"quarantined"');
    expect(registry).toContain("adapter_unregistered");
  });

  it("exposes a service-role-only read model for registry and health diagnostics", () => {
    expect(migration).toContain("cinema_source_registry_v");
    expect(migration).toContain("health_status");
    expect(migration).toContain("configuration_consistent");
    expect(migration).toContain("monitoring_flags_enabled");
    expect(migration).toContain("revoke all on public.cinema_source_registry_v from public, anon, authenticated");
    expect(migration).toContain("grant select on public.cinema_source_registry_v to service_role");
  });

  it("does not activate any source or venue in the migration", () => {
    expect(migration).not.toContain("set enabled = true");
    expect(migration).not.toContain("set monitor_enabled = true");
    expect(migration).not.toContain("update public.cinema_sources");
    expect(migration).not.toContain("update public.cinema_venues");
  });
});
