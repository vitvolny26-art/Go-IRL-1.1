/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const launchPage = readFileSync(new URL("./LaunchPage.tsx", import.meta.url), "utf8");
const launchCss = readFileSync(new URL("./launch-page.css", import.meta.url), "utf8");

describe("LaunchPage desktop header/auth alignment", () => {
  it("keeps launch auth positioning in scoped CSS instead of inline styles", () => {
    expect(launchPage).toContain('className="guest-app-auth-strip launch-auth-strip"');
    expect(launchPage).not.toContain('style={{ position: "static", transform: "none"');
    expect(launchCss).toMatch(/\.launch-root \.launch-auth-strip\{[^}]*position:static;[^}]*left:auto;[^}]*transform:none/);
  });

  it("uses the launch content width as the desktop alignment grid", () => {
    expect(launchCss).toMatch(/@media\(min-width:720px\)\{[^}]*\.launch-root \.app-header\{width:min\(100%,630px\)\}/);
    expect(launchCss).toContain('.launch-root .header-inner{padding-inline:16px}');
    expect(launchCss).toContain('.launch-root .launch-auth-strip{width:100%;margin:0 0 16px}');
  });
});
