import { describe, expect, it } from "vitest";
import { createBeautyPortfolioItem, createDefaultBeautyWorkspace } from "./beautySetupModel";
import {
  beautyProfessionalPhotoPortfolioId,
  getBeautyProfessionalPhoto,
  getBeautyWorkPortfolio,
  withBeautyProfessionalPhoto,
} from "./beautyProfessionalPhoto";

describe("Beauty professional photo projection", () => {
  it("stores the master photo inside the existing portfolio JSON while keeping work items separate", () => {
    const base = createDefaultBeautyWorkspace("en");
    const work = { ...createBeautyPortfolioItem(0), imageUrl: "https://cdn.example/work.jpg" };
    const workspace = withBeautyProfessionalPhoto({ ...base, portfolio: [work] }, "https://cdn.example/master.jpg");

    expect(getBeautyProfessionalPhoto(workspace.portfolio)).toMatchObject({
      id: beautyProfessionalPhotoPortfolioId,
      imageUrl: "https://cdn.example/master.jpg",
    });
    expect(getBeautyWorkPortfolio(workspace.portfolio)).toEqual([work]);
  });

  it("removes only the reserved master-photo item", () => {
    const base = createDefaultBeautyWorkspace("en");
    const withPhoto = withBeautyProfessionalPhoto(base, "https://cdn.example/master.jpg");
    expect(withBeautyProfessionalPhoto(withPhoto, "").portfolio).toEqual([]);
  });
});
