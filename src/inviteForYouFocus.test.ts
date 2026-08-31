import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Activity invite For You focus", () => {
  it("routes an invite to For You without opening the Activity Sheet and focuses the exact Activity card", () => {
    const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
    const inviteStart = source.indexOf("const invitedId = parsedStartParam?.eventId || pathId;");
    const inviteEnd = source.indexOf("const flash = (message: string)", inviteStart);
    const inviteFlow = source.slice(inviteStart, inviteEnd);

    expect(inviteFlow).toContain("setFocusedInviteActivityId(invitedActivity.id)");
    expect(inviteFlow).toContain("store.setSelectedCity(invitedActivity.cityId)");
    expect(inviteFlow).toContain('store.setView("discover")');
    expect(inviteFlow).not.toContain("openActivity(invitedActivity)");

    expect(source).toContain("focusedActivityId={focusedInviteActivityId}");
    expect(source).toContain("activity.id === focusedActivityId");
    expect(source).toContain("activity.id !== focusedActivity.id");
    expect(source).toContain('element.dataset.activityId === focusedActivityId');
    expect(source).toContain('closest<HTMLElement>("article.activity-card")');
    expect(source).toContain('scrollIntoView({ block: "center", inline: "center" })');
  });
});
