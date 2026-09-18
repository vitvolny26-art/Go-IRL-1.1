import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const app = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

describe("Akce001A offers navigation", () => {
  it("reduces the /offers bottom navigation to Home only", () => {
    expect(app).toContain('const isOffersDomain = normalizedAppPath === "/offers";');
    expect(app).toContain('offersHomeOnly={isOffersDomain}');
    expect(app).toContain('offersHomeOnly\n    ? [{ id: "home", label: labels[0], icon: <Home /> }]');
  });

  it("returns Home from /offers to the root launch surface", () => {
    expect(app).toContain('if (isOffersDomain && view === "home")');
    expect(app).toContain('window.location.assign("/")');
  });

  it("does not change the normal Activities and Services navigation definitions", () => {
    expect(app).toContain('{ id: "discover", label: labels[1], icon: <Sparkles /> }');
    expect(app).toContain('{ id: "explore", label: labels[2], icon: <Compass /> }');
    expect(app).toContain('? { id: "bookings", label: labels[3], icon: <CalendarDays /> }');
    expect(app).toContain(': { id: "create", label: actions.create, icon: <Plus /> }');
    expect(app).toContain('{ id: "profile", label: isServicesDomain ? actions.professional : labels[4]');
  });
});
