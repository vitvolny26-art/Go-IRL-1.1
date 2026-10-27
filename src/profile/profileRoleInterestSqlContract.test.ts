import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  profileRoleInterestSaveRpcName,
  profileRoleInterestTableName,
} from "./profileRoleInterestRepository";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261027203500_uprofile017_role_interest_persistence.sql", import.meta.url),
  "utf8",
);
const verification = readFileSync(
  new URL("../../supabase/verify_uprofile017_role_interest_persistence.sql", import.meta.url),
  "utf8",
);

describe("UProfile017 role-interest SQL contract", () => {
  it("creates one dedicated owner role-interest table without overloading global roles or interests", () => {
    expect(migration).toContain(`create table if not exists public.${profileRoleInterestTableName}`);
    expect(migration).toContain("references public.app_users(user_key) on delete cascade");
    expect(migration).toContain("primary key (user_key, role_id)");
    expect(migration).not.toContain("alter table public.user_roles");
    expect(migration).not.toContain("insert into public.user_profile_interests");
  });

  it("pins the canonical role and level sets", () => {
    for (const roleId of [
      "driver",
      "guide",
      "coach",
      "instructor",
      "photographer",
      "host",
      "dj",
      "mechanic",
      "translator",
      "mushroom-expert",
    ]) {
      expect(migration).toContain(`'${roleId}'`);
    }
    for (const level of ["want_to_try", "can_help", "professional"]) {
      expect(migration).toContain(`'${level}'`);
    }
  });

  it("uses owner-only RLS and explicit Data API grants", () => {
    expect(migration).toContain("alter table public.user_profile_role_interests enable row level security");
    expect(migration).toContain("using (user_key = public.go_irl_auth_user_key())");
    expect(migration).toContain("from public, anon, authenticated, service_role");
    expect(migration).toContain("to authenticated, service_role");
    expect(migration).not.toContain("to anon");
  });

  it("keeps the atomic save RPC SECURITY INVOKER and bounded", () => {
    expect(migration).toContain(`function public.${profileRoleInterestSaveRpcName}(`);
    expect(migration).toContain("security invoker");
    expect(migration).toContain("maximum 10 profile role interests allowed");
    expect(migration).toContain("profile role interests must use unique role IDs");
    expect(migration).toContain("on conflict (user_key, role_id) do update");
  });

  it("blocks Google and Facebook identity transfer when role interests exist", () => {
    const guard = "exists (select 1 from public.user_profile_role_interests where user_key = v_source_user_key)";
    expect(migration.split(guard).length - 1).toBe(2);
    expect(migration).toContain("go_irl_transfer_google_identity");
    expect(migration).toContain("go_irl_transfer_facebook_identity");
  });

  it("ships rollback-only functional verification", () => {
    expect(verification).toContain("begin;");
    expect(verification).toContain("rollback;");
    expect(verification).toContain("cross-user role-interest read allowed");
    expect(verification).toContain("cross-user role-interest insert allowed");
    expect(verification).toContain("role-interest clear failed");
  });
});
