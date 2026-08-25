/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const correction = readFileSync(
  new URL("../supabase/migrations/20260825173500_activ003_repeat_publication_p1_fixes.sql", import.meta.url),
  "utf8",
);

describe("Activ003 repeat publication P1 corrections", () => {
  it("creates repeatPublication before writing its child values", () => {
    expect(correction).toContain("jsonb_build_object(\n    'repeatPublication'");
    expect(correction).toContain("'enabled', true");
    expect(correction).toContain("'idempotencyKey', v_idempotency_key");
    expect(correction).not.toContain("'{repeatPublication,enabled}'");
  });

  it("applies publishability filters to every due-status branch", () => {
    const statusBlock = correction.indexOf("prompt.status in ('pending', 'failed')");
    const sharedFilters = correction.indexOf("and prompt.expires_at > now()", statusBlock);
    const enclosingClose = correction.lastIndexOf("    )\n    and prompt.expires_at > now()", sharedFilters);

    expect(statusBlock).toBeGreaterThan(-1);
    expect(sharedFilters).toBeGreaterThan(statusBlock);
    expect(enclosingClose).toBeGreaterThan(statusBlock);
    expect(correction).toContain("and activity.visibility <> 'private'");
    expect(correction).toContain("and go_irl_private.activity_repeat_enabled(activity.metadata)");
  });
});
