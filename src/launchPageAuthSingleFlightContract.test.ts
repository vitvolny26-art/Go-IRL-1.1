/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const launchPage = readFileSync(new URL("./LaunchPage.tsx", import.meta.url), "utf8");

describe("LaunchPage web auth single-flight contract", () => {
  it("allows only one provider redirect to own the PKCE verifier at a time", () => {
    expect(launchPage).toContain('const authInFlightRef = useRef(false)');
    expect(launchPage).toContain('if (authInFlightRef.current) return;');
    expect(launchPage).toContain('authInFlightRef.current = true;');
    expect(launchPage).toContain('authInFlightRef.current = false;');
  });

  it("disables every visible web provider button while a redirect is pending", () => {
    expect(launchPage.match(/disabled=\{authPending\} onClick=\{\(\) => void startWebAuth\("google"\)\}/g)).toHaveLength(2);
  });
});
