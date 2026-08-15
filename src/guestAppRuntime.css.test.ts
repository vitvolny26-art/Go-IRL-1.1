import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guestRuntimeCss = readFileSync(new URL("./guest-app-runtime.css", import.meta.url), "utf8");
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
});
