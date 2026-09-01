import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("activity chat organizer opt-in", () => {
  it("does not create a GO IRL chat when a participant opens or sends in the chat UI", () => {
    const panelSource = readFileSync(new URL("./components/ActivityChatPanel.tsx", import.meta.url), "utf8");
    const featureSource = readFileSync(new URL("./activityChatFeature.ts", import.meta.url), "utf8");

    const reloadStart = panelSource.indexOf("const reload = async () =>");
    const reloadEnd = panelSource.indexOf("useEffect(() =>", reloadStart);
    const reloadSource = panelSource.slice(reloadStart, reloadEnd);
    expect(reloadSource).not.toContain("ensureActivityChat");
    expect(reloadSource).toContain("loadActivityChat(activity.id)");

    const sendStart = featureSource.indexOf("export async function sendActivityChatMessage");
    const sendEnd = featureSource.indexOf("export async function hideOwnActivityChatMessage", sendStart);
    const sendSource = featureSource.slice(sendStart, sendEnd);
    expect(sendSource).not.toContain("ensureActivityChat");
    expect(sendSource).toContain("await loadActivityChat(activityId)");
    expect(sendSource).toContain('throw new Error("chat_not_created")');
  });

  it("keeps explicit organizer creation available", () => {
    const panelSource = readFileSync(new URL("./components/ActivityChatPanel.tsx", import.meta.url), "utf8");
    expect(panelSource).toContain("const handleCreateChat = async () =>");
    expect(panelSource).toContain("await ensureActivityChat(activity.id)");
    expect(panelSource).toContain("activityChatExists={Boolean(chat)}");
  });
});
