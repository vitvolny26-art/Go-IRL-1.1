import { describe, expect, it } from "vitest";
import repositorySource from "./beautyWorkspaceRepository.ts?raw";

describe("GROOMING018 Beauty workspace repository bridge", () => {
  it("prefers six-language save v4 and falls back without dropping legacy compatibility", () => {
    expect(repositorySource).toContain('supabase.rpc("save_my_beauty_profile_v4", expandedParams)');
    expect(repositorySource).toContain('supabase.rpc("save_my_beauty_profile_v3", expandedParams)');
    expect(repositorySource.indexOf('save_my_beauty_profile_v4')).toBeLessThan(repositorySource.indexOf('save_my_beauty_profile_v3'));
    expect(repositorySource).toContain('saveLocalizedBeautyWorkspace(workspace)');
    expect(repositorySource).toContain('saveLegacyBeautyWorkspace(workspace)');
  });

  it("maps the server city id instead of hardcoding Olomouc", () => {
    expect(repositorySource).toContain('city: getCity(row.city_id).name[language]');
    expect(repositorySource).not.toContain('city: "Olomouc"');
  });
});
