import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { rootStaticFiles } from "./vite.config";

describe("root static build assets", () => {
  it("emits verification and crawler files from public", () => {
    expect(rootStaticFiles).toEqual(expect.arrayContaining([
      "googleb92001635707669c.html",
      "robots.txt",
      "sitemap.xml",
    ]));
  });

  it("keeps the canonical homepage and crawler baseline on go-irl.fun", () => {
    const index = readFileSync(new URL("./index.html", import.meta.url), "utf8");
    const robots = readFileSync(new URL("./public/robots.txt", import.meta.url), "utf8");
    const sitemap = readFileSync(new URL("./public/sitemap.xml", import.meta.url), "utf8");
    const verification = readFileSync(new URL("./public/googleb92001635707669c.html", import.meta.url), "utf8");

    expect(index).toContain('<link rel="canonical" href="https://go-irl.fun/" />');
    expect(index).toContain('<meta property="og:url" content="https://go-irl.fun/" />');
    expect(index).toContain('<script type="application/ld+json">');
    expect(robots).toContain("User-agent: *\nAllow: /");
    expect(robots).toContain("Sitemap: https://go-irl.fun/sitemap.xml");
    expect(sitemap).toContain("<loc>https://go-irl.fun/</loc>");
    expect(sitemap).not.toMatch(/vercel\.app|goirl\.realitka\.pp\.ua/i);
    expect(verification.trim()).toBe("google-site-verification: googleb92001635707669c.html");
  });
});
