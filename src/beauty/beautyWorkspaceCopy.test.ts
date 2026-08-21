import { describe, expect, it } from "vitest";
import type { Language } from "../types";
import { beautyWorkspaceCopy } from "./beautyWorkspaceCopy";

const languages: Language[] = ["ru", "uk", "cs", "en"];

describe("beauty workspace copy", () => {
  it.each(languages)("provides complete navigation and calendar copy for %s", (language) => {
    const copy = beautyWorkspaceCopy[language];
    expect(copy.locale).toBeTruthy();
    expect(copy.weekdays).toHaveLength(7);
    expect([copy.navOverview, copy.navRequests, copy.navAppointments, copy.navPage, copy.navBusinessCard]).not.toContain("");
    expect(Object.values(copy.statuses)).toHaveLength(7);
    expect(Object.values(copy.statuses)).not.toContain("");
  });

  it("does not fall back to Russian for the Czech workspace shell", () => {
    const copy = beautyWorkspaceCopy.cs;
    expect(copy.overview).toBe("Přehled");
    expect(copy.requests).toBe("Požadavky");
    expect(copy.appointments).toBe("Rezervace");
    expect(copy.navBusinessCard).toBe("Vizitka");
    expect(copy.locale).toBe("cs-CZ");
  });
});
