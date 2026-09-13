import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const claimPage = readFileSync(new URL("../beauty/BeautyMasterClaimPage.tsx", import.meta.url), "utf8");
const settings = readFileSync(new URL("../beauty/BeautyWorkspaceSettingsDialog.tsx", import.meta.url), "utf8");
const panel = readFileSync(new URL("./CommunicationPreferencePanel.tsx", import.meta.url), "utf8");
const repository = readFileSync(new URL("./repository.ts", import.meta.url), "utf8");
const userGate = readFileSync(new URL("./UserCommunicationPreferenceGate.tsx", import.meta.url), "utf8");
const feature = readFileSync(new URL("./feature.ts", import.meta.url), "utf8");
const profilePreferences = readFileSync(new URL("../components/ProfilePreferences.tsx", import.meta.url), "utf8");
const cardReminder = readFileSync(new URL("../components/CardReminderAction.tsx", import.meta.url), "utf8");
const reminderTypes = readFileSync(new URL("../reminderPreferences.ts", import.meta.url), "utf8");
const verificationProxy = readFileSync(new URL("../../api/communications/telegram-verification.ts", import.meta.url), "utf8");
const joinWrapper = readFileSync(new URL("../../supabase/functions/telegramEventSupergroup/activityJoinCallback.ts", import.meta.url), "utf8");
const masterClaimEdge = readFileSync(new URL("../../supabase/functions/claimBeautyMasterOnboarding/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260913123000_chrem002d_default_notification_reminders.sql", import.meta.url), "utf8");

describe("ChRem002D notification defaults", () => {
  it("does not gate a successful participant join behind a channel chooser", () => {
    expect(userGate).toContain("return null");
    expect(userGate).not.toContain("setOpen");
    expect(migration).toContain("chrem002d_activity_join_notification_defaults");
    expect(migration).toContain("new.status <> 'joined'");
    expect(migration).toContain("v_activity.organizer_key = new.user_key");
  });

  it("seeds Activity notification defaults from auth and enables T-3h", () => {
    expect(migration).toContain("v_auth_provider = 'telegram'");
    expect(migration).toContain("else 'in_app'");
    expect(migration).toContain("selection_source = 'system_default'");
    expect(migration).toContain("v_scheduled_for := v_event_starts_at - interval '3 hours'");
    expect(migration).toContain("180");
  });

  it("prompts Telegram verification directly after a new supergroup join without rolling membership back", () => {
    expect(joinWrapper).toContain('result.status === "joined"');
    expect(joinWrapper).toContain("sendCommunicationVerificationRequests");
    expect(joinWrapper).toContain("Membership is durable");
  });

  it("keeps manual Settings choices authoritative", () => {
    expect(repository).toContain("preference_selection_source");
    expect(repository).toContain("p_selection_source: selectionSource");
    expect(panel).toContain('selectionSource = "settings"');
    expect(migration).toContain("v_preference.selection_source in ('first_join','settings')");
  });

  it("supports Telegram verification without exposing service credentials", () => {
    expect(panel).toContain("requestTelegramCommunicationVerification");
    expect(repository).toContain('fetch("/api/communications/telegram-verification"');
    expect(verificationProxy).toContain("go_irl_auth_user_key");
    expect(verificationProxy).toContain('"send_communication_verification_requests"');
  });

  it("stores the canonical notification channel in Profile Preferences", () => {
    expect(profilePreferences).toContain("<CommunicationPreferencePanel");
    expect(profilePreferences).toContain('allowedChannels={["telegram", "in_app"]}');
    expect(profilePreferences).not.toContain("reminderProvider");
  });

  it("routes Activity reminder editing through the canonical communication preference", () => {
    expect(cardReminder).toContain("loadCommunicationSettings");
    expect(cardReminder).toContain("configuredReminderChannel");
    expect(cardReminder).not.toContain("readUserPreferences");
    expect(cardReminder).not.toContain("card-reminder-channels");
    expect(cardReminder).toContain("new Set([180])");
    expect(reminderTypes).toContain('"in_app" | "telegram"');
  });

  it("reuses Beauty/Master 24h + 3h reminders and seeds the same channel default", () => {
    expect(migration).toContain("go_irl_sync_beauty_booking_reminders");
    expect(migration).toContain("perform public.go_irl_seed_notification_preference(v_booking.client_user_key)");
    expect(migration).toContain("array['24h','3h']");
    expect(migration).toContain("services.booking_reminder_24h");
    expect(migration).toContain("services.booking_reminder_3h");
  });

  it("auto-seeds the Master channel on Google claim and keeps Settings editable", () => {
    expect(claimPage).not.toContain('setState("communication")');
    expect(claimPage).not.toContain("<CommunicationPreferencePanel");
    expect(masterClaimEdge).toContain('supabase.rpc("go_irl_seed_notification_preference"');
    expect(settings).toContain("<CommunicationPreferencePanel language={language} />");
    expect(feature).toContain('VITE_GO_IRL_COMMUNICATION_ROUTER === "true"');
  });
});
