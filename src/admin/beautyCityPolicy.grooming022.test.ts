import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const onboardingSource = readFileSync(new URL("./beautyMasterOnboarding.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../../supabase/migrations/20260903130000_grooming022_remove_prerov.sql", import.meta.url),
  "utf8",
);
const verifySource = readFileSync(
  new URL("../../supabase/verify_grooming022_remove_prerov.sql", import.meta.url),
  "utf8",
);

describe("GROOMING022 Beauty city policy", () => {
  it("keeps the admin-approved onboarding payload Olomouc-only", () => {
    expect(onboardingSource).toContain('cityId: "olomouc";');
    expect(onboardingSource).toContain('|| value.cityId !== "olomouc"');
    expect(onboardingSource).not.toContain('cityId: "olomouc" | "prerov";');
    expect(onboardingSource).not.toContain('value.cityId !== "prerov"');
  });

  it("ships a forward-only database policy contraction without profile data rewrites", () => {
    expect(migrationSource).toContain("check (city_id = 'olomouc')");
    expect(migrationSource).toContain("and city_id = 'olomouc'");
    expect(migrationSource).toContain("go_irl_prepare_beauty_master_onboarding");
    expect(migrationSource).toContain("go_irl_list_public_beauty_professionals_v3");
    expect(migrationSource).toContain("go_irl_create_beauty_booking");
    expect(migrationSource).toContain("notify pgrst, 'reload schema'");
    expect(migrationSource).not.toMatch(/\bupdate\s+public\.beauty_professional_profiles\b/i);
  });

  it("keeps the production verifier read-only and Olomouc-only", () => {
    expect(verifySource).toContain("grooming022_prerov_removal_verification_passed");
    expect(verifySource).toContain("Beauty city constraint is not Olomouc-only");
    expect(verifySource).toContain("Beauty master prepare city guard is not Olomouc-only");
    expect(verifySource).not.toMatch(/\binsert\s+into\b/i);
    expect(verifySource).not.toMatch(/\bupdate\s+public\./i);
    expect(verifySource).not.toMatch(/\bdelete\s+from\b/i);
  });
});
