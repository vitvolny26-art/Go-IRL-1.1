/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260912172000_uprofile017_organizer_stats_projection.sql", import.meta.url),
  "utf8",
);
const verification = readFileSync(
  new URL("../../supabase/verify_uprofile017_organizer_stats_projection.sql", import.meta.url),
  "utf8",
);
const projection = readFileSync(new URL("./organizerTrustProjection.ts", import.meta.url), "utf8");

describe("UProfile017 organizer stats SQL contract", () => {
  it("exposes one aggregate RPC without a raw public view", () => {
    expect(migration).toContain("create or replace function public.go_irl_get_organizer_stats(p_organizer_user_key text)");
    expect(migration).toContain("average_rating numeric");
    expect(migration).toContain("rating_count bigint");
    expect(migration).toContain("completed_activity_count bigint");
    expect(migration.toLowerCase()).not.toContain("create view");
    expect(migration.toLowerCase()).not.toContain("grant select");
  });

  it("uses only canonical eligible attended ratings from confirmed activities", () => {
    expect(migration).toContain("avg(feedback.organizer_rating::numeric)");
    expect(migration).toContain("feedback.eligibility_state = 'eligible'");
    expect(migration).toContain("feedback.resolution = 'attended'");
    expect(migration).toContain("feedback.organizer_rating is not null");
    expect(migration).toContain("outcome.event_resolution = 'confirmed_happened'");
    expect(migration).toContain("count(distinct outcome.activity_id)::bigint");
    expect(migration).not.toContain("group by feedback.activity_id");
  });

  it("keeps raw feedback behind RLS and grants aggregate execution only", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function public.go_irl_get_organizer_stats(text) from public, anon");
    expect(migration).toContain("grant execute on function public.go_irl_get_organizer_stats(text) to authenticated, service_role");
    expect(verification).toContain("has_function_privilege('anon', v_oid, 'execute')");
    expect(verification).toContain("has_function_privilege('authenticated', v_oid, 'execute')");
    expect(verification).toContain("has_function_privilege('service_role', v_oid, 'execute')");
  });

  it("matches the schema-neutral UProfile read model", () => {
    expect(projection).toContain("average_rating: number | string | null");
    expect(projection).toContain("rating_count: number | string");
    expect(projection).toContain("completed_activity_count: number | string");
    expect(projection).toContain("averageRating: number | null");
    expect(projection).toContain("ratingCount: number");
    expect(projection).toContain("completedActivityCount: number");
  });
});
