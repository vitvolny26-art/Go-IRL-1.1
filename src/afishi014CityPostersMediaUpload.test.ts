import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.resolve("api/city-posters/maintenance.ts"), "utf8");

describe("AFISHI014 City Posters media upload contract", () => {
  it("reuses the existing protected City Posters function", () => {
    expect(src).toContain("isReminderWorkerAuthorized(request)");
    expect(src).toContain('const MEDIA_BUCKET = "city-posters-media"');
    expect(src).toContain("8 * 1024 * 1024");
    expect(src).toContain('"image/webp"');
    expect(src).toContain('"x-upsert": "false"');
    expect(src).toContain('requireEnv("SUPABASE_SERVICE_ROLE_KEY")');
    expect(src).toContain('request.headers.has("x-city-posters-object-path")');
    expect(src).not.toContain("SUPABASE_ANON");
    expect(fs.existsSync(path.resolve("api/city-posters/media.ts"))).toBe(false);
  });

  it("preserves the existing maintenance action and returns the canonical Storage URL after upload", () => {
    expect(src).toContain('action: "maintain_city_poster_publications"');
    expect(src).toContain("/storage/v1/object/public/");
    expect(src).toContain("if (!upload.ok)");
    expect(src).toContain("publicUrl:");
  });
});
