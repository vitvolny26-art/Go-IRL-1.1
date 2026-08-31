import { describe, expect, it } from "vitest";
import { createBeautyService, createDefaultBeautyWorkspace, withBeautyServices } from "./beautySetupModel";
import {
  buildBeautyShareCardFingerprint,
  buildBeautyShareImageAssetKey,
  formatBeautyShareCardPublicLink,
  resolveBeautyShareCardServices,
  resolveBeautyShareImageIdentity,
} from "./beautyShareCardModel";

describe("Beauty sharing business card", () => {
  it("uses no more than three active services in the selected order", () => {
    let workspace = createDefaultBeautyWorkspace("ru");
    const services = [workspace.service, ...[1, 2, 3].map((index) => {
      const service = createBeautyService("ru", index, `service-${index}`);
      service.name = `Услуга ${index}`;
      service.nameByLanguage.ru = service.name;
      service.priceCzk = 100 * index;
      return service;
    })];
    workspace = withBeautyServices(workspace, services);
    workspace.shareCard.serviceIds = [services[2].id, services[0].id, services[3].id, services[1].id];

    expect(resolveBeautyShareCardServices(workspace, "ru").map((service) => service.id))
      .toEqual([services[2].id, services[0].id, services[3].id]);
  });

  it("regenerates when visible profile content or artwork settings change", () => {
    const workspace = createDefaultBeautyWorkspace("en");
    const original = buildBeautyShareCardFingerprint(workspace);
    workspace.profile.displayName = "Studio Vita";
    const renamed = buildBeautyShareCardFingerprint(workspace);
    workspace.shareCard.backgroundPositionY = 72;
    const repositioned = buildBeautyShareCardFingerprint(workspace);

    expect(renamed).not.toBe(original);
    expect(repositioned).not.toBe(renamed);
  });

  it("regenerates when the primary active specialization changes", () => {
    let workspace = createDefaultBeautyWorkspace("en");
    const nailsFingerprint = buildBeautyShareCardFingerprint(workspace);
    workspace = withBeautyServices(workspace, workspace.services.map((service) => ({
      ...service,
      specialization: "barber" as const,
    })));

    expect(buildBeautyShareCardFingerprint(workspace)).not.toBe(nailsFingerprint);
  });

  it("keeps uploaded artwork identity stable across signed URL refreshes", () => {
    const dataUrl = "data:image/png;base64,c3RhYmxlLWJlYXV0eS1sb2dv";
    const assetKey = buildBeautyShareImageAssetKey(dataUrl);
    const signedA = `https://project.supabase.co/storage/v1/object/sign/beauty-share-assets/user-1/beauty-share-card/logo/${assetKey}.png?token=first`;
    const signedB = `https://project.supabase.co/storage/v1/object/sign/beauty-share-assets/user-1/beauty-share-card/logo/${assetKey}.png?token=second`;

    expect(resolveBeautyShareImageIdentity(dataUrl)).toBe(`asset:${assetKey}`);
    expect(resolveBeautyShareImageIdentity(signedA)).toBe(`asset:${assetKey}`);
    expect(resolveBeautyShareImageIdentity(signedB)).toBe(`asset:${assetKey}`);

    const workspace = createDefaultBeautyWorkspace("en");
    workspace.shareCard.logoImageDataUrl = dataUrl;
    const beforeUpload = buildBeautyShareCardFingerprint(workspace);
    workspace.shareCard.logoImageDataUrl = signedA;
    const firstSignedUrl = buildBeautyShareCardFingerprint(workspace);
    workspace.shareCard.logoImageDataUrl = signedB;
    const refreshedSignedUrl = buildBeautyShareCardFingerprint(workspace);

    expect(firstSignedUrl).toBe(beforeUpload);
    expect(refreshedSignedUrl).toBe(firstSignedUrl);
  });

  it("keeps the legacy public-link formatter available outside the image renderer", () => {
    expect(formatBeautyShareCardPublicLink("/beauty/studio-vita")).toBe("goirl.app/beauty/studio-vita");
    expect(formatBeautyShareCardPublicLink("https://goirl.app/studio-vita")).toBe("goirl.app/studio-vita");
  });
});
