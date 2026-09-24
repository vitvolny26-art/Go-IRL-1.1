import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "public/service-worker.js"), "utf8");
const mainSource = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
const cityPostersEntry = readFileSync(resolve(process.cwd(), "src/city-posters/entry.tsx"), "utf8");

describe("service artwork cache policy", () => {
  it("keeps the deployed cache namespace while limiting install precache to the offline fallback", () => {
    expect(source).toContain('go-irl-offline-v5');
    expect(source).toContain('const appShellUrls = [offlineUrl]');
  });

  it("never serves a cached application document while online", () => {
    const navigationStart = source.indexOf('if (event.request.mode === "navigate")');
    const navigationEnd = source.indexOf("const requestUrl", navigationStart);
    const navigationPolicy = source.slice(navigationStart, navigationEnd);

    expect(navigationPolicy).toContain('fetch(event.request, { cache: "no-store" })');
    expect(navigationPolicy).toContain("caches.match(offlineUrl)");
    expect(navigationPolicy).not.toContain("cache.put(event.request");
    expect(navigationPolicy).not.toContain("caches.match(event.request)");
  });

  it("forces both application entries to check the service worker without HTTP cache", () => {
    for (const entry of [mainSource, cityPostersEntry]) {
      expect(entry).toContain('register("/service-worker.js", { updateViaCache: "none" })');
      expect(entry).toContain(".then((registration) => registration.update())");
    }
  });

  it("uses network-first for service artwork and caches only real images", () => {
    expect(source).toContain('requestUrl.pathname.startsWith("/services/")');
    expect(source).toContain('contentType.startsWith("image/")');
    expect(source).toContain('response.ok');
    expect(source.indexOf('fetch(event.request)')).toBeLessThan(source.indexOf('caches.match(event.request)', source.indexOf('requestUrl.pathname.startsWith("/services/")')));
  });
});
