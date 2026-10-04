import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const ranking = source("../api/_shared/cinema-weekly-ranking.ts");
const runtime = source("../api/_shared/cinema-weekly-ranking-runtime.ts");
const migration = source("../supabase/migrations/20261004170000_kino000l_top10_ranking_lock.sql");

describe("Kino000L Top 10 ranking lock contract", () => {
  it("uses deterministic score-first tie-breakers and one candidate per movie", () => {
    expect(ranking).toContain("right.score - left.score");
    expect(ranking).toContain("compareText(left.showing_from, right.showing_from)");
    expect(ranking).toContain("compareText(right.showing_until, left.showing_until)");
    expect(ranking).toContain("compareText(left.id, right.id)");
    expect(migration).toContain("partition by d.movie_id");
    expect(migration).toContain("d.score desc");
    expect(migration).toContain("d.showing_from asc");
    expect(migration).toContain("d.showing_until desc");
    expect(migration).toContain("d.id asc");
  });

  it("locks at most top_limit into the weekly snapshot and transitions collecting to ranked", () => {
    expect(migration).toContain("r.candidate_rank <= v_selection.top_limit");
    expect(migration).toContain("publication_state");
    expect(migration).toContain("'queued'");
    expect(migration).toContain("publication_authorized");
    expect(migration).toContain("false");
    expect(migration).toContain("state = 'ranked'");
    expect(migration).toContain("locked_at = now()");
  });

  it("is immutable and idempotent after lock", () => {
    expect(migration).toContain("if v_selection.state <> 'collecting' then");
    expect(migration).toContain("cinema_weekly_ranking_partial_snapshot");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  it("captures a candidate identity/data snapshot without approval or publication", () => {
    expect(migration).toContain("jsonb_build_object(");
    expect(migration).toContain("'candidate_id', r.candidate_id");
    expect(migration).toContain("'title', r.title");
    expect(migration).not.toContain("cinema_weekly_publication_approvals");
    expect(migration).not.toContain("city_posters_events");
    expect(runtime).toContain("publication_authorized: false");
  });

  it("keeps the mutation service-role only", () => {
    expect(migration).toContain("revoke all on function public.cinema_lock_weekly_publication_ranking");
    expect(migration).toContain("grant execute on function public.cinema_lock_weekly_publication_ranking(uuid)");
    expect(migration).toContain("to service_role");
  });
});
