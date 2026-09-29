import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.resolve("api/city-posters/media.ts"), "utf8");

describe("AFISHI014 City Posters media upload contract", () => {
  it("keeps upload server-only and bounded", () => {
    expect(src).toContain("isReminderWorkerAuthorized(request)");
    expect(src).toContain('const BUCKET = "city-posters-media"');
    expect(src).toContain("8 * 1024 * 1024");
    expect(src).toContain('"image/webp"');
    expect(src).toContain('"x-upsert": "false"');
    expect(src).toContain('requireEnv("SUPABASE_SERVICE_ROLE_KEY")');
    expect(src).not.toContain("SUPABASE_ANON");
  });

  it("returns only the canonical public Storage URL after a successful upload", () => {
    expect(src).toContain("/storage/v1/object/public/");
    expect(src).toContain("if (!upload.ok)");
    expect(src).toContain("publicUrl:");
  });
});
