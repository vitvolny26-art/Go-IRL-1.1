import { describe, expect, it } from "vitest";
import { normalizeActivityCreateDate } from "./activityCalendarDate";

describe("Activ002 Activity create calendar date", () => {
  it("promotes the stale UTC default to the browser-local current day", () => {
    expect(normalizeActivityCreateDate("2026-08-25", "2026-08-26", "2026-08-25"))
      .toBe("2026-08-26");
  });

  it("does not rewrite an explicitly selected date", () => {
    expect(normalizeActivityCreateDate("2026-08-27", "2026-08-26", "2026-08-25"))
      .toBe("2026-08-27");
  });

  it("does not rewrite dates when UTC and local calendar days already match", () => {
    expect(normalizeActivityCreateDate("2026-08-26", "2026-08-26", "2026-08-26"))
      .toBe("2026-08-26");
  });
});
