import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../api/telegram/prepared-beauty-share.ts", import.meta.url),
  "utf8",
);

describe("prepared Beauty share route", () => {
  it("uses the language-aware canonical on-demand image and public app profile URL", () => {
    expect(source).not.toContain("loadTrustedBeautyShareArtwork");
    expect(source).toContain('const image = new URL("/api/meta/event-preview", publicAppOrigin())');
    expect(source).toContain('image.searchParams.set("language", card.language)');
    expect(source).toContain('image.searchParams.set("format", "image")');
    expect(source).not.toContain('image.searchParams.set("format", "download")');
    expect(source).toContain('image.searchParams.set("v", "14")');
    expect(source).toContain("publicAppOrigin()");
    expect(source).toContain("https://go-irl.fun");
    expect(source).not.toContain("https://go-irl-1-1.vercel.app");
  });
});
