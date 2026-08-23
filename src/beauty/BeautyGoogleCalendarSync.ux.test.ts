import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import syncSource from "./BeautyGoogleCalendarSync.tsx?raw";
import confirmationSource from "./BeautyBookingConfirmationModeControl.tsx?raw";
import masterSource from "./BeautyMasterWorkspacePage.tsx?raw";

const edgeFunction = readFileSync(new URL("../../supabase/functions/beautyGoogleCalendar/index.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../supabase/migrations/20260823005200_beauty_google_calendar_integration.sql", import.meta.url), "utf8");

describe("Beauty Google Calendar synchronization contract", () => {
  it("keeps Google Calendar sync manual-only in Records while preserving OAuth callback lifecycle", () => {
    expect(confirmationSource).toContain("<BeautyGoogleCalendarSyncControl language={language} />");
    expect(masterSource).toContain("<BeautyGoogleCalendarLifecycle />");
    expect(syncSource).toContain('requestBeautyGoogleCalendar("sync")');
    expect(syncSource).toContain('requestBeautyGoogleCalendar("disconnect")');
    expect(syncSource).not.toContain('requestBeautyGoogleCalendar("set_mode"');
    expect(syncSource).not.toContain("autoSyncIntervalMs");
    expect(syncSource).not.toContain("setInterval");
    expect(syncSource).not.toContain("visibilitychange");
    expect(syncSource).not.toContain('"auto"');
  });

  it("keeps OAuth refresh credentials server-side and browser storage free", () => {
    expect(syncSource).not.toContain("refresh_token");
    expect(syncSource).not.toContain("localStorage");
    expect(syncSource).not.toContain("sessionStorage");
    expect(edgeFunction).toContain('requiredEnv("GO_IRL_GOOGLE_CALENDAR_TOKEN_KEY")');
    expect(edgeFunction).toContain('name: "AES-GCM"');
    expect(edgeFunction).toContain('authorizationUrl.searchParams.set("scope", calendarScope)');
    expect(edgeFunction).toContain('authorizationUrl.searchParams.set("access_type", "offline")');
    expect(edgeFunction).toContain('authorizationUrl.searchParams.set("prompt", "consent")');
  });

  it("keeps Google non-canonical and prevents direct credential-table access", () => {
    expect(edgeFunction).toContain('description: "GO IRL appointment. Manage changes in GO IRL."');
    expect(edgeFunction).not.toContain("client_contact_snapshot");
    expect(edgeFunction).not.toContain("client_name_snapshot");
    expect(migration).toContain("alter table public.beauty_google_calendar_connections enable row level security");
    expect(migration).toContain("revoke all on table public.beauty_google_calendar_connections from authenticated");
    expect(migration).toContain("Refresh tokens are AES-GCM ciphertext");
  });
});
