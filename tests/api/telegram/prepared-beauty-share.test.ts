import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../api/telegram/prepared-beauty-share.ts", import.meta.url),
  "utf8",
);

describe("prepared Beauty share route", () => {
  it("matches the browser transport contract used by Activity prepared share", () => {
    expect(source).toContain('const allowedBrowserOrigins = new Set(["https://go-irl.fun", "https://go-irl-1-1.vercel.app"])');
    expect(source).toContain('response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")');
    expect(source).toContain('response.setHeader("Access-Control-Allow-Headers", "Content-Type")');
    expect(source).toContain('if (request.method === "OPTIONS") return response.status(204).end()');
    expect(source).toContain("const MAX_BODY_BYTES = 16 * 1024");
    expect(source).toContain("await readBody(request)");
    expect(source).toContain('return json(response, 413, { error: "payload_too_large" })');
  });

  it("uses the language-aware canonical on-demand image and public app profile URL", () => {
    expect(source).not.toContain("loadTrustedBeautyShareArtwork");
    expect(source).toContain('const image = new URL("/api/meta/event-preview", publicAppOrigin())');
    expect(source).toContain('image.searchParams.set("language", card.language)');
    expect(source).toContain('image.searchParams.set("format", "image")');
    expect(source).not.toContain('image.searchParams.set("format", "download")');
    expect(source).toContain('image.searchParams.set("v", "14")');
    expect(source).toContain("publicAppOrigin()");
    expect(source).toContain('const publicAppFallbackOrigin = "https://go-irl.fun"');
  });
});
