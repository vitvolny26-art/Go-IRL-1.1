import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

describe("Activ020 invite-only link access", () => {
  it("does not expose invite-only Activities in ordinary discovery", async () => {
    const store = await source("src/store.ts");
    expect(store).toContain('row.visibility === "public" || row.organizer_key === userKey || row.id === invitedActivityId || memberActivityIds.has(row.id)');
    expect(store).toContain('member.user_key === userKey');
  });

  it("redirects browser invite participation to a signed Telegram launch", async () => {
    const app = await source("src/App.tsx");
    const store = await source("src/store.ts");
    expect(app).toContain('activity.visibility === "invite" && activity.organizerKey !== getUserKey() && !store.joinedIds.includes(activity.id) && !store.waitingIds.includes(activity.id) && !store.pendingIds.includes(activity.id)');
    expect(app).toContain("window.location.assign(inviteUrl)");
    expect(store).toContain('getCurrentStartParam()?.toLowerCase() === id.toLowerCase()');
  });

  it("only uses a signed Telegram launch for direct Mini App admission", async () => {
    const store = await source("src/store.ts");
    const edge = await source("supabase/functions/telegramEventSupergroup/activ020SignedInviteJoin.ts");
    const router = await source("supabase/functions/telegramEventSupergroup/index.ts");
    expect(store).toContain('getCurrentStartParam()?.toLowerCase() === id.toLowerCase()');
    expect(store).toContain('action: "join_signed_invitation"');
    expect(edge).toContain("validateTelegramInitData({ initData, botToken })");
    expect(edge).toContain("verified.startParam?.toLowerCase() !== eventId.toLowerCase()");
    expect(edge).toContain('event.data.visibility !== "invite"');
    expect(edge).toContain('event.data.series_occurrence_status === "cancelled"');
    expect(edge).toContain('error: "event_full"');
    expect(router).toContain('action === "join_signed_invitation"');
    expect(store).toContain('activity.organizerKey === userKey ? "joined" : activity.visibility === "invite" ? "pending" : "joined"');
  });
});
