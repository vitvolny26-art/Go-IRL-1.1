import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "public/service-worker.js"), "utf8");

describe("service artwork cache policy", () => {
  it("rotates the offline cache after the stale artwork incident", () => {
    expect(source).toContain('go-irl-offline-v5');
    expect(source).not.toContain('go-irl-offline-v4');
  });

  it("uses network-first for service artwork and caches only real images", () => {
    expect(source).toContain('requestUrl.pathname.startsWith("/services/")');
    expect(source).toContain('contentType.startsWith("image/")');
    expect(source).toContain('response.ok');
    expect(source.indexOf('fetch(event.request)')).toBeLessThan(source.indexOf('caches.match(event.request)', source.indexOf('requestUrl.pathname.startsWith("/services/")')));
  });
});
