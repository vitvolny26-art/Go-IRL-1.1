/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const client = readFileSync(new URL("./telegramEventSupergroup.ts", import.meta.url), "utf8");
const edgeIndex = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url),
  "utf8",
);
const cityPublication = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/cityPublication.ts", import.meta.url),
  "utf8",
);

describe("Activ020 first invite-only recipient picker", () => {
  it("requires at least one selected invitee before invite-only creation can submit", () => {
    expect(app).toContain('visibility === "invite" && selectedInitialInviteUserKeys.length < 1');
    expect(app).toContain('visibility === "invite" && (initialInviteLoading || selectedInitialInviteUserKeys.length < 1)');
    expect(app).toContain('title: "Пригласить *"');
    expect(app).toContain('hint: "Для режима «По ссылке» выберите минимум одного получателя из подтверждённой команды."');
    expect(app).toContain('required: "Обязательное поле: выберите хотя бы одного получателя."');
    expect(app).toContain('choose: "Выбрать получателей"');
    expect(app).toContain("setInitialInvitePickerOpen(true)");
    expect(app).toContain('role="dialog" aria-modal="true" aria-label={inviteCopy.title}');
    expect(app).not.toContain("<InitialActivityInviteDialog");
    expect(app).not.toContain("inviteSomeoneToGoIrl");
    expect(app).not.toContain('emptyAction: "Пригласить человека"');
    expect(app).not.toContain("https://t.me/share/url?url=");
  });

  it("shows the required invite field only for the UI mode \"По ссылке\"", () => {
    expect(app).toContain('visibility === "invite" ? (');
    expect(app).toContain('value="invite" checked={visibility === "invite"}');
    expect(app).toContain("<span>{t.invite}</span>");
    expect(app).toContain("{initialInviteLoading ? inviteCopy.loading : invitePickerCopy.choose}");
    expect(app).toContain("invitePickerCopy.selected(selectedInitialInviteUserKeys.length)");
    expect(app).toContain("disabled={submitting || initialInviteLoading}");
    expect(app).not.toContain("disabled={submitting || initialInviteLoading || initialInviteCandidates.length < 1}");
    expect(app).toContain("initialInviteCandidates.length > 0 ? (");
    expect(app).toContain("<div className=\"form-error\">{inviteCopy.empty}</div>");
    expect(app).not.toContain('visibility === "public" ? (\n          <fieldset>\n            <legend>{inviteCopy.title}</legend>');
    expect(app).not.toContain('visibility === "private" ? (\n          <fieldset>\n            <legend>{inviteCopy.title}</legend>');
  });

  it("reuses accepted organizer team relationships as the bounded people source", () => {
    expect(app).toContain("buildOrganizerAcceptedTeam(records, actorUserKey)");
    expect(app).toContain("createOrganizerTeamRelationshipsRepository(supabase, actorUserKey)");
    expect(app).toContain("profiles.loadPublicProfiles(userKeys)");
  });

  it("uses the existing trusted Telegram Edge transport before completing create", () => {
    expect(client).toContain('"invite_activity_members"');
    expect(client).toContain("memberUserKeys: uniqueUserKeys");
    expect(app).toContain("await sendInitialActivityInvites(id, selectedInitialInviteUserKeys)");
    expect(app.indexOf("id = await createActivity(activity)")).toBeLessThan(app.indexOf("await sendInitialActivityInvites(id, selectedInitialInviteUserKeys)"));
    expect(app).toContain('if (inviteResult.sent < 1) throw new Error("initial_activity_invite_required")');
    expect(cityPublication).toContain('url:`https://go-irl.fun/join/${encodeURIComponent(a.id)}`');
    expect(app).toContain("await deleteActivity(id)");
    expect(edgeIndex).toContain('action === "invite_activity_members"');
    expect(edgeIndex).toContain('action: "invite_activity_members"');
  });

  it("fails closed unless the actor owns the invite-only Activity and every target is accepted", () => {
    expect(cityPublication).toContain('if(a.organizer_key!==actor)throw new Error("organizer_required")');
    expect(cityPublication).toContain('if(a.visibility!=="invite")throw new Error("activity_not_invite_only")');
    expect(cityPublication).toContain('.from("organizer_team_relationships")');
    expect(cityPublication).toContain('.eq("status","accepted")');
    expect(cityPublication).toContain('throw new Error("activity_invite_target_not_accepted")');
  });

  it("records delivered first-invite recipients so retries skip duplicate Telegram sends", () => {
    expect(cityPublication).toContain("initialInviteUserKeys");
    expect(cityPublication).toContain("if(delivered.has(user)){skipped++;continue}");
    expect(cityPublication).toContain('await t("sendMessage"');
    expect(cityPublication).toContain("initialInviteUserKeys:[...delivered]");
  });
});
