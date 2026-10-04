import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync(
  new URL("../api/_shared/cinema-ingestion-worker.ts", import.meta.url),
  "utf8",
);

describe("Kino000E worker parse gate contract", () => {
  it("derives parse status and RESOLVE gating from the shared validator", () => {
    expect(worker).toContain("const validation = validateCinemaParseResult(source, parsed)");
    expect(worker).toContain('const status = validation.scopeComplete ? "success" : "quarantined"');
    expect(worker).toContain("if (validation.scopeComplete) {");
    expect(worker).not.toContain("if (parsed.scope_complete) {");
  });

  it("preserves quarantined row evidence in staging with validation errors", () => {
    expect(worker).toContain("validation_errors: validation.rowValidationErrors[index] || []");
    expect(worker).toContain("normalized_payload: row");
    expect(worker).toContain('"cinema_screening_staging"');
  });

  it("stores effective scope and validator diagnostics in parse_runs", () => {
    expect(worker).toContain("scope_complete: validation.scopeComplete");
    expect(worker).toContain("error_message: validation.errorMessage");
    expect(worker).toContain("metrics: validation.metrics");
  });
});
