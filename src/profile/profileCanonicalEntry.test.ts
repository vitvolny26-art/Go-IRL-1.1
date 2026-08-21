import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { canonicalProfilePath, enterCanonicalProfile } from "./profileEntry";

const servicesNavigationSource = readFileSync(
  new URL("../beauty/ServicesBottomNavigationPortal.tsx", import.meta.url),
  "utf8",
);

const memoryHistory = () => ({
  pushState: vi.fn(),
  replaceState: vi.fn(),
});

describe("UProfile016 canonical profile entry", () => {
  it("opens the canonical profile route from a vertical context", () => {
    const history = memoryHistory();
    const setView = vi.fn();

    expect(enterCanonicalProfile({ currentView: "home", setView, history })).toBe("open");
    expect(history.pushState).toHaveBeenCalledWith({}, "", canonicalProfilePath);
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(setView).toHaveBeenCalledTimes(1);
    expect(setView).toHaveBeenLastCalledWith("profile");
  });

  it("remounts an already-open profile before returning to its saved summary", () => {
    const history = memoryHistory();
    const setView = vi.fn();
    const scheduled: Array<() => void> = [];

    expect(enterCanonicalProfile({
      currentView: "profile",
      setView,
      history,
      mode: "replace",
      schedule: (callback) => { scheduled.push(callback); },
    })).toBe("reopen");

    expect(setView).toHaveBeenCalledTimes(1);
    expect(setView).toHaveBeenLastCalledWith("home");
    expect(history.replaceState).not.toHaveBeenCalled();

    scheduled[0]?.();

    expect(history.replaceState).toHaveBeenCalledWith({}, "", canonicalProfilePath);
    expect(setView).toHaveBeenCalledTimes(2);
    expect(setView).toHaveBeenLastCalledWith("profile");
  });

  it("routes the Services profile tab through the canonical profile entry", () => {
    expect(servicesNavigationSource).toContain('onClick={() => openCanonicalProfile("push")}');
    expect(servicesNavigationSource).toContain('if (servicesPath && view === "profile")');
    expect(servicesNavigationSource).not.toContain('onClick={() => setView("profile")}');
  });

  it("resets an active identity editor when Profile is opened again", () => {
    expect(servicesNavigationSource).toContain('document.querySelector(".profile-page.is-editing")');
    expect(servicesNavigationSource).toContain('document.addEventListener("click", handleProfileReopen, true)');
    expect(servicesNavigationSource).toContain('openCanonicalProfile("replace")');
  });
});
