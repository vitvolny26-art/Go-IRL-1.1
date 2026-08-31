import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import pageSource from "./BeautyMasterWorkspacePage.tsx?raw";
import localStorageSource from "./beautyWorkspaceLocalStorage.ts?raw";
import repositorySource from "./beautyWorkspaceRepository.ts?raw";
import storageSource from "./beautyWorkspaceStorage.ts?raw";

const migrationSource = readFileSync(
  new URL("../../supabase/migrations/20260831114500_grooming021_beauty_save_v4_profile_id.sql", import.meta.url),
  "utf8",
);

describe("GROOMING021 Beauty workspace persistence", () => {
  it("uses local draft persistence until the professional explicitly saves", () => {
    expect(storageSource).toContain("export const saveBeautyWorkspaceDraft");
    expect(pageSource).toContain("saveBeautyWorkspaceDraft(workspace)");
    expect(pageSource).toContain("if (loading || !saveDirty) return;");
    expect(pageSource).toContain("const dirty = await hasBeautyWorkspaceDraft();");
    expect(pageSource).toContain("setSaveDirty(dirty);");
    expect(localStorageSource).toContain('const draftStateKey = "draft-state"');
    expect(localStorageSource).toContain("baseUpdatedAt: string | null");
    expect(localStorageSource).toContain("markLocalBeautyWorkspaceDraft");
    expect(localStorageSource).toContain("clearLocalBeautyWorkspaceDraft");
    expect(repositorySource).toContain("const localDraft = await loadLocalBeautyWorkspaceDraftState();");
    expect(repositorySource).toContain("expectedServerUpdatedAt = localDraft.baseUpdatedAt;");
    expect(repositorySource).toContain("await rebaseLocalBeautyWorkspaceDraft(row.updated_at);");
    expect(storageSource).toContain("await markLocalBeautyWorkspaceDraft(getBeautyWorkspaceServerRevision());");
    expect(storageSource).toContain("const hasDraft = await hasLocalBeautyWorkspaceDraft();");
    expect(storageSource).toContain("reconcilePersistedShareCardWithDraft(workspace, remoteWorkspace)");
    expect(storageSource).toContain("remoteCard.sourceFingerprint !== buildBeautyShareCardFingerprint(draftWorkspace)");
    expect(pageSource).toContain("await clearBeautyWorkspaceDraft();");
    expect(pageSource).not.toContain("void saveBeautyWorkspace(workspace);");
    expect(pageSource).toContain("await saveBeautyWorkspace(snapshot);");
    expect(pageSource).toContain("beauty-header-save");
    expect(pageSource).toContain("saveCopy[language].saved");
  });

  it("keeps share-card render reconciliation outside the user revision counter and waits for the current batch", () => {
    const userChangeStart = pageSource.indexOf("const changeWorkspace = (next: BeautyWorkspace) => {");
    const reconcileStart = pageSource.indexOf("const reconcileWorkspace = (next: BeautyWorkspace, persistenceRequired = false) => {");
    const reconcileEnd = pageSource.indexOf("const changeProfession", reconcileStart);
    const reconcileSource = pageSource.slice(reconcileStart, reconcileEnd);

    expect(userChangeStart).toBeGreaterThanOrEqual(0);
    expect(pageSource.slice(userChangeStart, reconcileStart)).toContain("workspaceRevisionRef.current += 1");
    expect(reconcileStart).toBeGreaterThan(userChangeStart);
    expect(reconcileSource).toContain("if (persistenceRequired) setSaveDirty(true)");
    expect(reconcileSource).not.toContain("workspaceRevisionRef.current += 1");
    expect(pageSource).toContain("const BeautyShareCardController = lazy");
    expect(pageSource).toContain("<BeautyShareCardController workspace={workspace} language={language} onChange={reconcileWorkspace} />");
    expect(pageSource).toContain("getBeautyShareCardGeneratedBatch(shareCardFingerprint)");
    expect(pageSource).toContain("const shareCardRenderPending = workspace.shareCard.enabled");
    expect(pageSource).toContain("if (!saveDirty || shareCardRenderPending || persistenceActionRef.current) return;");
    expect(pageSource).toContain("disabled={!saveDirty || shareCardRenderPending || saveBusy || publicationBusy}");
  });

  it("serializes Save with publication and persists before changing publication state", () => {
    const publicationStart = pageSource.indexOf("const togglePublication = async () => {");
    const publicationEnd = pageSource.indexOf("const saveLabel =", publicationStart);
    const publicationSource = pageSource.slice(publicationStart, publicationEnd);

    expect(pageSource).toContain('persistenceActionRef.current = "save"');
    expect(publicationStart).toBeGreaterThanOrEqual(0);
    expect(publicationEnd).toBeGreaterThan(publicationStart);
    expect(publicationSource).toContain("if (shareCardRenderPending || persistenceActionRef.current) return;");
    expect(publicationSource).toContain('persistenceActionRef.current = "publication"');
    expect(publicationSource).toContain("await saveBeautyWorkspace(next);");
    expect(publicationSource.indexOf("await saveBeautyWorkspace(next);")).toBeLessThan(publicationSource.indexOf("setWorkspace(next);"));
    expect(publicationSource).toContain("workspaceRevisionRef.current === revision");
    expect(publicationSource).toContain("setWorkspace((current) => ({");
    expect(pageSource).toContain("publicationBusy={publicationBusy || saveBusy || shareCardRenderPending}");
  });

  it("qualifies the v4 service update so profile_id cannot resolve ambiguously", () => {
    expect(migrationSource).toContain("update public.beauty_professional_services as service_row");
    expect(migrationSource).toContain("where service_row.profile_id = v_result.profile_id");
    expect(migrationSource).toContain("and service_row.client_key = v_client_key");
    expect(migrationSource).not.toContain("where profile_id = v_result.profile_id");
  });
});
