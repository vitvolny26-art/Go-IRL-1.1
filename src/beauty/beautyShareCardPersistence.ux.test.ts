import { describe, expect, it } from "vitest";
import editorSource from "./BeautyShareCardEditor.tsx?raw";
import repositorySource from "./beautyShareCardRepository.ts?raw";
import workspaceRepositorySource from "./beautyWorkspaceRepository.ts?raw";
import storageSource from "./beautyWorkspaceStorage.ts?raw";

describe("Beauty share card persistence contract", () => {
  it("uses server-backed persistence for trusted Telegram and provider professionals", () => {
    const workspaceGuard = workspaceRepositorySource.slice(
      workspaceRepositorySource.indexOf("const usesTrustedBeautyStorage"),
      workspaceRepositorySource.indexOf("const isMissingRpc"),
    );
    const shareCardGuard = repositorySource.slice(
      repositorySource.indexOf("const usesTrustedBeautyStorage"),
      repositorySource.indexOf("const ensureTrustedBeautyStorage"),
    );

    for (const guard of [workspaceGuard, shareCardGuard]) {
      expect(guard).toContain('identity?.source === "trusted-telegram"');
      expect(guard).toContain('identity?.source === "trusted-provider"');
      expect(guard).toContain('getCurrentUserRole() === "professional"');
    }
  });

  it("waits for trusted auth instead of silently skipping remote persistence", () => {
    expect(repositorySource).toContain("initializeTrustedAuth");
    expect(repositorySource).toContain("await initializeTrustedAuth()");
    expect(repositorySource).toContain("beauty_share_trusted_auth_required");
    expect(repositorySource).toContain("if (!(await ensureTrustedBeautyStorage(true))) return");
    expect(repositorySource).toContain("beauty_share_card_rpc_missing");
  });

  it("decouples profile persistence from share-card failures", () => {
    const profileFlow = storageSource.slice(
      storageSource.indexOf("const saveBeautyWorkspaceProfileNow = async"),
      storageSource.indexOf("const saveBeautyShareCardNow = async"),
    );
    const combinedFlow = storageSource.slice(
      storageSource.indexOf("export const saveBeautyWorkspace = async"),
      storageSource.indexOf("export const resetBeautyWorkspace"),
    );
    expect(profileFlow).toContain("await saveBeautyWorkspaceBase(workspace)");
    expect(profileFlow).not.toContain("saveRemoteBeautyShareCard");
    expect(combinedFlow).toContain("await saveBeautyWorkspaceProfile(workspace)");
    expect(combinedFlow).toContain("await saveBeautyShareCard(workspace).catch(() => undefined)");
  });

  it("publishes ready only after Storage and RPC persistence succeed", () => {
    const saveFlow = storageSource.slice(
      storageSource.indexOf("const saveBeautyShareCardNow = async"),
      storageSource.indexOf("const enqueueBeautyWorkspaceProfileSave"),
    );
    expect(storageSource).toContain("prepareBeautyWorkspaceForPersistence");
    expect(saveFlow.indexOf("await saveRemoteBeautyShareCard(persistedWorkspace)")).toBeLessThan(
      saveFlow.indexOf('status: "ready"'),
    );
    expect(saveFlow).toContain("await saveLocalBeautyWorkspace(persistedWorkspace)");
    expect(storageSource).toContain("beautyShareCardPersistenceEvent");
    expect(saveFlow).toContain('dispatchBeautyShareCardPersistence({ sourceFingerprint, status: "ready"');
    expect(saveFlow).toContain('dispatchBeautyShareCardPersistence({ sourceFingerprint, status: "error"');
  });

  it("keeps the editor updating until the persistence event confirms the fingerprint", () => {
    expect(editorSource).toContain("beautyShareCardPersistenceEvent");
    expect(editorSource).toContain("current.shareCard.sourceFingerprint !== detail.sourceFingerprint");
    const renderedCard = editorSource.slice(
      editorSource.indexOf("void Promise.all(beautyTranslationLanguages.map"),
      editorSource.indexOf(".catch((error: unknown)"),
    );
    expect(renderedCard).toContain("beautyTranslationLanguages.map");
    expect(renderedCard).toContain("cacheBeautyShareCardGeneratedBatch");
    expect(renderedCard).toContain('status: "updating"');
    expect(renderedCard).not.toContain('status: "ready"');
  });
});
