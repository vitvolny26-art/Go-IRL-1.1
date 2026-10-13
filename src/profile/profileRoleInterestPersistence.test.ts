import { describe, expect, it } from "vitest";
import { profileRoleIds } from "./profileRoleCatalog";
import {
  maxProfileRoleInterests,
  parseProfileRoleInterestRows,
  serializeProfileRoleInterestSelection,
  setProfileRoleInterest,
} from "./profileRoleInterestPersistence";

describe("profileRoleInterestPersistence", () => {
  it("parses canonical persisted rows into a bounded owner selection", () => {
    expect(parseProfileRoleInterestRows([
      { role_id: "driver", interest_level: "can_help" },
      { role_id: "photographer", interest_level: "professional" },
    ])).toEqual({
      driver: "can_help",
      photographer: "professional",
    });
  });

  it("rejects non-canonical role IDs and interest levels", () => {
    expect(parseProfileRoleInterestRows([
      { role_id: "free-text-role", interest_level: "can_help" },
    ])).toBeNull();
    expect(parseProfileRoleInterestRows([
      { role_id: "driver", interest_level: "expert" },
    ])).toBeNull();
  });

  it("rejects duplicate role rows and over-bounded payloads", () => {
    expect(parseProfileRoleInterestRows([
      { role_id: "driver", interest_level: "want_to_try" },
      { role_id: "driver", interest_level: "professional" },
    ])).toBeNull();

    expect(parseProfileRoleInterestRows([
      ...profileRoleIds.map((role_id) => ({ role_id, interest_level: "can_help" })),
      { role_id: "driver", interest_level: "can_help" },
    ])).toBeNull();

    expect(maxProfileRoleInterests).toBe(profileRoleIds.length);
  });

  it("serializes in canonical catalog order", () => {
    expect(serializeProfileRoleInterestSelection({
      translator: "professional",
      driver: "want_to_try",
    })).toEqual([
      { role_id: "driver", interest_level: "want_to_try" },
      { role_id: "translator", interest_level: "professional" },
    ]);
  });

  it("sets, changes and clears one role without affecting the others", () => {
    const initial = {
      driver: "want_to_try",
      guide: "can_help",
    } as const;

    const promoted = setProfileRoleInterest(initial, "driver", "professional");
    expect(promoted).toEqual({
      driver: "professional",
      guide: "can_help",
    });

    expect(setProfileRoleInterest(promoted, "guide", null)).toEqual({
      driver: "professional",
    });
  });
});
