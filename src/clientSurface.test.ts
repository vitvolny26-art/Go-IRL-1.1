import { describe, expect, it } from "vitest";
import {
  applyGoIrlLaunchContext,
  resolveGoIrlClient,
  resolveGoIrlLaunchContext,
} from "./clientSurface";

describe("resolveGoIrlClient", () => {
  it("uses the web shell without Telegram launch data", () => {
    expect(resolveGoIrlClient(undefined)).toBe("web");
    expect(resolveGoIrlClient({ WebApp: {} })).toBe("web");
  });

  it("preserves the Telegram shell when initData exists", () => {
    expect(resolveGoIrlClient({ WebApp: { initData: "signed-init-data" } })).toBe("telegram");
  });

  it("preserves the Telegram shell when a Telegram user exists", () => {
    expect(resolveGoIrlClient({ WebApp: { initDataUnsafe: { user: { id: 1 } } } })).toBe("telegram");
  });
});

describe("resolveGoIrlLaunchContext", () => {
  it("treats verified Telegram launch data as authoritative", () => {
    expect(resolveGoIrlLaunchContext({
      telegram: { WebApp: { initData: "signed-init-data" } },
      search: "?source=instagram",
      userAgent: "Instagram 400.0",
    })).toEqual({ client: "telegram", channel: "telegram", inAppBrowser: true });
  });

  it("uses explicit smart-link attribution for Meta and WhatsApp entry", () => {
    expect(resolveGoIrlLaunchContext({ search: "?source=messenger&medium=message" }))
      .toEqual({ client: "web", channel: "messenger", inAppBrowser: true });
    expect(resolveGoIrlLaunchContext({ search: "?source=whatsapp&medium=message" }))
      .toEqual({ client: "web", channel: "whatsapp", inAppBrowser: true });
  });

  it("falls back to known in-app browser user agents", () => {
    expect(resolveGoIrlLaunchContext({ userAgent: "Mozilla/5.0 Instagram 400.0" }).channel).toBe("instagram");
    expect(resolveGoIrlLaunchContext({ userAgent: "Mozilla/5.0 FBAN/FB4A FBAV/520.0" }).channel).toBe("facebook");
    expect(resolveGoIrlLaunchContext({ userAgent: "Mozilla/5.0 MessengerForiOS" }).channel).toBe("messenger");
  });

  it("keeps ordinary and untrusted sources in the web context", () => {
    expect(resolveGoIrlLaunchContext({ search: "?source=email", userAgent: "Mozilla/5.0 Chrome/150" }))
      .toEqual({ client: "web", channel: "web", inAppBrowser: false });
  });

  it("publishes the context as stable document data attributes", () => {
    const root = { dataset: {} } as Pick<HTMLElement, "dataset">;
    applyGoIrlLaunchContext(root, { client: "web", channel: "instagram", inAppBrowser: true });
    expect(root.dataset).toMatchObject({
      goIrlClient: "web",
      goIrlChannel: "instagram",
      goIrlInAppBrowser: "true",
    });
  });
});
