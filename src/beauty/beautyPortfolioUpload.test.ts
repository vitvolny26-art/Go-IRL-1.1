import { describe, expect, it } from "vitest";
import {
  beautyPortfolioBucket,
  beautyPortfolioMaxBytes,
  buildBeautyPortfolioPath,
  validateBeautyPortfolioFile,
} from "./beautyPortfolioUpload";

describe("Beauty portfolio uploads", () => {
  it("uses a stable public bucket for persisted portfolio URLs", () => {
    expect(beautyPortfolioBucket).toBe("beauty-share-cards");
  });

  it("builds a user-scoped storage path", () => {
    expect(buildBeautyPortfolioPath("telegram:42", { name: "work.webp", type: "image/webp" }, "photo-1"))
      .toBe("telegram:42/beauty-portfolio/photo-1.webp");
  });

  it("accepts supported images within the size limit", () => {
    expect(() => validateBeautyPortfolioFile({ type: "image/jpeg", size: beautyPortfolioMaxBytes })).not.toThrow();
  });

  it("rejects unsupported files and oversized images", () => {
    expect(() => validateBeautyPortfolioFile({ type: "image/gif", size: 100 })).toThrow("beauty_portfolio_unsupported_type");
    expect(() => validateBeautyPortfolioFile({ type: "image/png", size: beautyPortfolioMaxBytes + 1 })).toThrow("beauty_portfolio_file_too_large");
  });
});
