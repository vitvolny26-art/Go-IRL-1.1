/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const app=readFileSync(new URL("./App.tsx",import.meta.url),"utf8");

describe("Activ020 team or Telegram invite source",()=>{
  it("offers both sources",()=>{
    expect(app).toContain('type InitialInviteSource = "team" | "telegram"');
    expect(app).toContain('value="team" checked={initialInviteSource === "team"}');
    expect(app).toContain('value="telegram" checked={initialInviteSource === "telegram"}');
    expect(app).toContain('team:"Моя команда"');
  });
  it("uses accepted team for My team",()=>{
    expect(app).toContain("createOrganizerTeamRelationshipsRepository(supabase,actorUserKey)");
    expect(app).toContain("buildOrganizerAcceptedTeam(records,actorUserKey)");
    expect(app).not.toContain("loadInitialActivityInviteCandidates()");
  });
  it("keeps direct delivery for team",()=>{
    expect(app).toContain('initialInviteSource === "team"');
    expect(app).toContain("await sendInitialActivityInvites(id, selectedInitialInviteUserKeys)");
    expect(app).toContain("await deleteActivity(id)");
  });
  it("creates Activity before opening Telegram destination picker without a delivery callback",()=>{
    expect(app).toContain('initialInviteSource === "telegram"');
    expect(app).toContain("buildTelegramShareUrl(inviteUrl,inviteSourceCopy.share(activityText))");
    expect(app).toContain("webApp.openTelegramLink(shareUrl)");
    expect(app).not.toContain("await createHiddenActivityInviteDraft(activity");
    expect(app).not.toContain("await deliverPreparedActivityInvite(prepared)");
    expect(app.indexOf("id = await createActivity(activity)")).toBeLessThan(app.indexOf("webApp.openTelegramLink(shareUrl)"));
  });
  it("does not require a GO IRL recipient for Telegram mode",()=>{
    expect(app).toContain('visibility === "invite" && !initialInviteSource');
    expect(app).toContain('initialInviteSource === "team" && selectedInitialInviteUserKeys.length < 1');
  });
});
