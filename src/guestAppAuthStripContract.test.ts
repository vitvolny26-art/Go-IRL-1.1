/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guestAppRuntime = readFileSync(new URL("./guestAppRuntime.ts", import.meta.url), "utf8");

describe("guest app auth strip contract", () => {
  it("exposes Telegram and Google without a Facebook login CTA", () => {
    expect(guestAppRuntime).toContain('strip.append(telegram, google, status)');
    expect(guestAppRuntime).not.toContain('labels.facebook');
    expect(guestAppRuntime).not.toContain('startAuth("facebook"');
    expect(guestAppRuntime).not.toContain('beginFacebookWebAuth');
  });
});
