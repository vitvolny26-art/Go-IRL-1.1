import { describe, expect, it } from "vitest";
import { getNamedTeamsActorUserKey } from "./namedTeamsActor";

describe("People003A trusted actor", () => {
  it("never returns an empty string", () => {
    const result = getNamedTeamsActorUserKey();
    expect(result === null || result.length > 0).toBe(true);
  });
});
