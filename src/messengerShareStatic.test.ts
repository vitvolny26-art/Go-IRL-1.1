import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rootStaticFiles } from "../vite.config";

describe("Messenger HTTPS share bridge build contract", () => {
  it("emits the Messenger bridge as a root-level static asset", () => {
    expect(rootStaticFiles).toContain("messenger-share.html");
    const source = readFileSync(new URL("../public/messenger-share.html", import.meta.url), "utf8");
    expect(source).toContain("<!doctype html>");
    expect(source).toContain("GO IRL — Share");
  });
});
