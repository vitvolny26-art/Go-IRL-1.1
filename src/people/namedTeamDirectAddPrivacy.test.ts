import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("../../supabase/migrations/20261013130000_people003d_direct_team_add_privacy.sql", import.meta.url), "utf8");
describe("PEOPLE003D direct team add privacy SQL contract", () => {
  it("defaults to allowing direct team addition and enables RLS", () => {
    expect(sql).toMatch(/block_direct_add boolean not null default false/i);
    expect(sql).toMatch(/alter table public\.named_team_join_preferences enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.named_team_join_preferences from public,anon,authenticated/i);
  });
  it("enforces authenticated self-only preference reads and writes", () => {
    expect(sql).toMatch(/auth\.role\(\) is distinct from 'authenticated' or v_actor is null/i);
    expect(sql).toMatch(/values\(v_actor,p_block\)/i);
    expect(sql).toMatch(/where user_key=v_actor/i);
    expect(sql).toMatch(/grant execute on function public\.go_irl_named_team_join_preference\(boolean\) to authenticated/i);
  });
  it("restricts direct additions to team owner or admin and respects target opt-out", () => {
    expect(sql).toMatch(/v_actor_role not in \('owner','admin'\)/i);
    expect(sql).toMatch(/p_action='add' and exists\(select 1 from public\.named_team_join_preferences/i);
    expect(sql).toMatch(/user_key=v_target and block_direct_add=true/i);
    expect(sql).toMatch(/raise exception 'direct_team_add_blocked'/i);
    expect(sql).toMatch(/case when p_action='add' then 'active' else 'invited' end/i);
  });
  it("preserves invitation actions and revokes anonymous RPC access", () => {
    expect(sql).toMatch(/'invite','add','accept','decline','leave','remove'/i);
    expect(sql).toMatch(/revoke all on function public\.go_irl_named_team_membership_action\(uuid,text,text\) from public,anon/i);
  });
});
