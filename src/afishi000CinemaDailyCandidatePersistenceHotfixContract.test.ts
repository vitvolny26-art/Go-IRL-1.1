import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hotfix = readFileSync(
  new URL(
    "../supabase/migrations/20261001022000_afishi000_daily_movie_city_candidate_persistence_function_hotfix.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("AFISHI000 Step C persistence function hotfix", () => {
  it("qualifies validation CTE columns so RETURNS TABLE output variables cannot shadow them", () => {
    expect(hotfix).toContain("from input i");
    expect(hotfix).toContain("where i.movie_id is null");
    expect(hotfix).toContain("or i.city_id is distinct from p_city_id");
    expect(hotfix).toContain("or i.showing_until < i.showing_from");
    expect(hotfix).toContain("or i.priority not in");
    expect(hotfix).not.toMatch(/from input\s+where movie_id is null/);
  });

  it("is forward-only and preserves the Step C decision and publication boundaries", () => {
    expect(hotfix).toContain(
      "create or replace function public.cinema_persist_daily_movie_city_candidates(",
    );
    expect(hotfix).not.toContain("create table");
    expect(hotfix).not.toContain("alter table");
    expect(hotfix).not.toContain("drop table");
    expect(hotfix).not.toMatch(/do update set[\s\S]*decision_status\s*=/);
    expect(hotfix).not.toContain("insert into public.activities");
    expect(hotfix).not.toContain("insert into public.city_posters_events");
    expect(hotfix).not.toContain("insert into public.cinema_ingestion_jobs");
  });

  it("retains the service-role-only function execution contract", () => {
    expect(hotfix).toContain("security definer");
    expect(hotfix).toContain("set search_path = pg_catalog, public");
    expect(hotfix).toContain(
      "revoke all on function public.cinema_persist_daily_movie_city_candidates(text,jsonb,timestamptz)",
    );
    expect(hotfix).toContain(
      "grant execute on function public.cinema_persist_daily_movie_city_candidates(text,jsonb,timestamptz)",
    );
    expect(hotfix).toContain("to service_role");
  });
});
