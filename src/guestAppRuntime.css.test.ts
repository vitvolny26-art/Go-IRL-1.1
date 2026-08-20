import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guestRuntimeCss = readFileSync(new URL("./guest-app-runtime.css", import.meta.url), "utf8");
const guestRuntimeSource = readFileSync(new URL("./guestAppRuntime.ts", import.meta.url), "utf8");
const appHeaderSource = readFileSync(new URL("./components/AppHeader.tsx", import.meta.url), "utf8");
const beautyProfileCss = readFileSync(
  new URL("./beauty/beauty-professional-profile.css", import.meta.url),
  "utf8",
);

describe("guest auth strip overlay contract", () => {
  it("keeps the existing guest auth strip above an open Beauty profile", () => {
    const guestProfileRule = guestRuntimeCss.match(
      /html\.go-irl-guest-app body\.beauty-profile-open \.guest-app-auth-strip\s*\{[^}]*z-index:\s*(\d+)/,
    );
    const beautyBackdropRule = beautyProfileCss.match(
      /\.beauty-pro-profile-backdrop\s*\{[^}]*z-index:\s*(\d+)/,
    );

    expect(guestProfileRule).not.toBeNull();
    expect(beautyBackdropRule).not.toBeNull();
    expect(Number(guestProfileRule?.[1])).toBeGreaterThan(Number(beautyBackdropRule?.[1]));
  });

  it("relocates guest auth into the desktop header while preserving mobile strip behavior", () => {
    expect(guestRuntimeCss).toContain("grid-template-columns: 92px minmax(0, 1fr) auto;");
    expect(guestRuntimeCss).toContain('html[data-go-irl-client="web"] .guest-app-auth-strip.is-header-auth');
    expect(guestRuntimeCss).toContain('html[data-go-irl-client="web"] .launch-mobile-auth-strip');
    expect(guestRuntimeCss).toContain("display: none !important;");
    expect(guestRuntimeCss).toContain('html[data-go-irl-client="web"].go-irl-guest-app .app');
  });

  it("rebinds guest auth after the React header renders or remounts", () => {
    expect(guestRuntimeSource).toContain('const headerAuthSlotReadyEvent = "go-irl-header-auth-slot-ready";');
    expect(guestRuntimeSource).toContain("window.addEventListener(headerAuthSlotReadyEvent, syncGuestUi);");
    expect(guestRuntimeSource).toContain("window.removeEventListener(headerAuthSlotReadyEvent, syncGuestUi);");
    expect(appHeaderSource).toContain('window.dispatchEvent(new Event("go-irl-header-auth-slot-ready"));');
  });
});
