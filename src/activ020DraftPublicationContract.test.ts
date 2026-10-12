import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(new URL("../supabase/migrations/20261012092900_activ020_publish_confirmed_draft.sql", import.meta.url), "utf8");
const edge = readFileSync(new URL("../supabase/functions/telegramEventSupergroup/cityPublication.ts", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url), "utf8");

describe("Activ020 atomic Telegram-confirmed publication contract", () => {
  it("restricts activation to service role after verified sent state", () => {
    expect(sql).toContain("draft.state <> 'sent'");
    expect(sql).toContain("draft.expires_at <= now()");
    expect(sql).toContain("for update");
    expect(sql).toContain("revoke all on function public.activ020_publish_sent_invite_draft(uuid, text) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.activ020_publish_sent_invite_draft(uuid, text) to service_role");
    expect(sql).toContain("insert into public.activities");
    expect(sql).toContain("insert into public.activity_members");
    expect(sql).toContain("state = 'published'");
    expect(sql).toContain("if draft.state = 'published' then");
  });

  it("checks the authenticated organizer and server-side delivery state", () => {
    expect(edge).toContain('if(action==="confirm_prepared_activity_invite")');
    expect(edge).toContain('existing.data.organizer_key!==claims.go_irl_user_key');
    expect(edge).toContain('existing.data.state!=="sent"&&existing.data.state!=="published"');
    expect(edge).toContain('db.rpc("activ020_publish_sent_invite_draft"');
    expect(proxy).toContain('if (action === "confirm_prepared_activity_invite")');
  });
});
