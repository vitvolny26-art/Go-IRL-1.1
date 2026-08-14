import { describe, expect, it } from "vitest";
import { activityIdPrefixFromAlias } from "../../../api/meta/event-preview.js";
import vercel from "../../../vercel.json";

describe("Activity short share alias", () => {
  it("extracts the exact UUID prefix only from bounded aliases", () => {
    expect(activityIdPrefixFromAlias("roliki-v-parke_3b172dd9")).toBe("3b172dd9");
    expect(activityIdPrefixFromAlias("ROLiki_ABCDEF12")).toBe("abcdef12");
    expect(activityIdPrefixFromAlias("bad_alias")).toBeNull();
  });

  it("routes root short aliases through the existing event preview function", () => {
    expect(vercel.rewrites).toContainEqual({
      source: "/:alias([a-z0-9-]+_[0-9a-fA-F]{8})",
      destination: "/api/meta/event-preview?alias=:alias",
    });
  });
});
