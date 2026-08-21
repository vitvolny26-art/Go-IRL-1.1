/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { beautyServiceSpecializations, createBeautyService, normalizeBeautyServiceSpecialization } from "./beautySetupModel";

const migration = readFileSync(new URL("../../supabase/migrations/20260821131500_barber001_service_specialization.sql", import.meta.url), "utf8");

describe("BARBER001 service specialization contract", () => {
  it("supports exactly Nails and Barber interfaces", () => {
    expect(beautyServiceSpecializations).toEqual(["nails", "barber"]);
    expect(createBeautyService("en").specialization).toBe("nails");
    expect(normalizeBeautyServiceSpecialization("barber")).toBe("barber");
    expect(normalizeBeautyServiceSpecialization("beauty")).toBe("nails");
  });
  it("persists specialization through canonical v3 service JSON", () => {
    expect(migration).toContain("requires canonical save_my_beauty_profile_v3");
    expect(migration).toContain("add column if not exists specialization text not null default 'nails'");
    expect(migration).toContain("check (specialization in ('nails', 'barber'))");
    expect(migration).toContain("service.specialization");
    expect(migration).toContain("regexp_replace");
    expect(migration).toContain("client_key,[[:space:]]*service_name,");
    expect(migration).toContain("v_item ->> ''specialization''");
    expect(migration).toContain("specialization = excluded.specialization");
  });
});
