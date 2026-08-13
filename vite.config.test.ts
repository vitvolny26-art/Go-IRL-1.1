import { describe, expect, it } from "vitest";
import { rootStaticFiles } from "./vite.config";

describe("root static build assets", () => {
  it("emits verification and crawler files from public", () => {
    expect(rootStaticFiles).toEqual(expect.arrayContaining([
      "googleb92001635707669c.html",
      "robots.txt",
      "sitemap.xml",
    ]));
  });
});
