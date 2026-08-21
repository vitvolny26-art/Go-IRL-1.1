import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { canonicalProfilePath, enterCanonicalProfile } from "./profileEntry";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const servicesNavigationSource = readFileSync(
  new URL("../beauty/ServicesBottomNavigationPortal.tsx", import.meta.url),
  "utf8",
);
const profilePanelSource = readFileSync(
  new URL("../components/ProfilePanel.tsx", import.meta.url),
  "utf8",
);

const memoryHistory = () => ({
  pushState: vi.fn(),
  replaceState: vi.fn(),
});

describe("UProfile016 canonical profile entry", () => {
  it("opens the canonical profile route from a generic context", () => {
    const history = memoryHistory();
    const setView = vi.fn();

    expect(enterCanonicalProfile({ currentView: "home", setView, history })).toBe("open");
    expect(history.pushState).toHaveBeenCalledWith({}, "", canonicalProfilePath);
    expect(history.replaceState).not.toHaveBeenCalled();
    expect(setView).toHaveBeenCalledTimes(1);
    expect(setView).toHaveBeenLastCalledWith("profile");
  });

  it("remounts an already-open generic profile before returning to its saved summary", () => {
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

  it("keeps Services Profile on the Services host while rendering canonical UProfile", () => {
    expect(servicesNavigationSource).toContain("const openServicesProfile = () =>");
    expect(servicesNavigationSource).toContain("onClick={openServicesProfile}");
    expect(servicesNavigationSource).not.toContain('if (servicesPath && view === "profile")');
    expect(appSource).toContain('{store.view === "profile" && <ProfileView');
    expect(appSource).not.toContain('store.view === "profile" && (isServicesDomain');
    expect(appSource).not.toContain('ServicesClientProfileView language={store.language}');
  });

  it("keeps hosted profile section changes on the host route", () => {
    expect(profilePanelSource).toContain("if (isProfilePath(window.location.pathname))");
    expect(profilePanelSource).toContain("window.history.pushState({}, \"\", profilePathForSection(next.activeSection))");
  });

  it("resets an active identity editor when generic Profile is opened again", () => {
    expect(servicesNavigationSource).toContain('document.querySelector(".profile-page.is-editing")');
    expect(servicesNavigationSource).toContain('document.addEventListener("click", handleProfileReopen, true)');
    expect(servicesNavigationSource).toContain('openCanonicalProfile("replace")');
  });
});
