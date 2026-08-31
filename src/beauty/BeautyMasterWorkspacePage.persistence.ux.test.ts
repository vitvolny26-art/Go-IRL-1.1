import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pageSource from "./BeautyMasterWorkspacePage.tsx?raw";
import storageSource from "./beautyWorkspaceStorage.ts?raw";

const migrationSource = readFileSync(
  new URL("../../supabase/migrations/20260831114500_grooming021_beauty_save_v4_profile_id.sql", import.meta.url),
  "utf8",
);

describe("GROOMING021 Beauty workspace persistence", () => {
  it("uses local draft persistence until the professional explicitly saves", () => {
    expect(storageSource).toContain("export const saveBeautyWorkspaceDraft");
    expect(pageSource).toContain("saveBeautyWorkspaceDraft(workspace)");
    expect(pageSource).not.toContain("void saveBeautyWorkspace(workspace);");
    expect(pageSource).toContain("await saveBeautyWorkspace(snapshot);");
    expect(pageSource).toContain("beauty-header-save");
    expect(pageSource).toContain("saveCopy[language].saved");
  });

  it("serializes Save with publication and persists before changing publication state", () => {
    const publicationStart = pageSource.indexOf("const togglePublication = async () => {");
    const publicationEnd = pageSource.indexOf("const saveLabel =", publicationStart);
    const publicationSource = pageSource.slice(publicationStart, publicationEnd);

    expect(pageSource).toContain('persistenceActionRef.current = "save"');
    expect(publicationStart).toBeGreaterThanOrEqual(0);
    expect(publicationEnd).toBeGreaterThan(publicationStart);
    expect(publicationSource).toContain('persistenceActionRef.current = "publication"');
    expect(publicationSource).toContain("await saveBeautyWorkspace(next);");
    expect(publicationSource.indexOf("await saveBeautyWorkspace(next);")).toBeLessThan(publicationSource.indexOf("setWorkspace(next);"));
    expect(publicationSource).toContain("workspaceRevisionRef.current === revision");
    expect(publicationSource).toContain("setWorkspace((current) => ({");
    expect(pageSource).toContain("publicationBusy={publicationBusy || saveBusy}");
  });

  it("qualifies the v4 service update so profile_id cannot resolve ambiguously", () => {
    expect(migrationSource).toContain("update public.beauty_professional_services as service_row");
    expect(migrationSource).toContain("where service_row.profile_id = v_result.profile_id");
    expect(migrationSource).toContain("and service_row.client_key = v_client_key");
    expect(migrationSource).not.toContain("where profile_id = v_result.profile_id");
  });
});
