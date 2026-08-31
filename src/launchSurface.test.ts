import { describe, expect, it, vi } from "vitest";
import { isCanonicalGuestAppRoute, resolveLaunchSurface } from "./launchSurface";

describe("resolveLaunchSurface", () => {
  it("shows the launch page at the clean root URL", () => {
    expect(resolveLaunchSurface({ pathname: "/", hash: "", search: "" })).toBe("launch");
  });

  it("opens the shared application at /activities", () => {
    expect(resolveLaunchSurface({ pathname: "/activities", hash: "", search: "" })).toBe("app");
  });

  it("opens the same shared application at /services", () => {
    expect(resolveLaunchSurface({ pathname: "/services", hash: "", search: "" })).toBe("app");
  });

  it("treats public catalogs and event entries as canonical guest app routes", () => {
    const activityId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";
    expect(isCanonicalGuestAppRoute("/activities")).toBe(true);
    expect(isCanonicalGuestAppRoute("/services/")).toBe(true);
    expect(isCanonicalGuestAppRoute(`/e/${activityId}`)).toBe(true);
    expect(isCanonicalGuestAppRoute(`/join/${activityId}`)).toBe(true);
    expect(isCanonicalGuestAppRoute("/create")).toBe(false);
    expect(isCanonicalGuestAppRoute("/profile")).toBe(false);
    expect(isCanonicalGuestAppRoute("/e/not-an-event")).toBe(false);
  });

  it("opens Beauty startapp links in the application surface", () => {
    expect(resolveLaunchSurface({ pathname: "/", hash: "", search: "", telegramStartParam: "beauty-test-studio" })).toBe("app");
    expect(resolveLaunchSurface({ pathname: "/", hash: "", search: "?startapp=beauty-06b9689e8b1ee69a" })).toBe("app");
  });

  it("routes attributed Telegram Beauty startapp links to Services without losing message attribution", () => {
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
      location: { hostname: "go-irl.fun", origin: "https://go-irl.fun" },
      history: { replaceState },
    });
    try {
      expect(resolveLaunchSurface({
        pathname: "/",
        hash: "",
        search: "",
        telegramStartParam: "beauty-test-studio__tgmsg",
      })).toBe("app");
      expect(replaceState).toHaveBeenCalledWith(
        null,
        "",
        "/services?beauty=beauty-test-studio&source=telegram&medium=message",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not intercept application routes or non-Beauty Telegram invitations", () => {
    expect(resolveLaunchSurface({ pathname: "/profile", hash: "", search: "" })).toBe("app");
    expect(resolveLaunchSurface({ pathname: "/", hash: "", search: "?startapp=event-1" })).toBe("app");
    expect(resolveLaunchSurface({ pathname: "/", hash: "", search: "", telegramStartParam: "event-1" })).toBe("app");
  });
});
