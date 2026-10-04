import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync(
  new URL("../api/_shared/cinema-ingestion-worker.ts", import.meta.url),
  "utf8",
);

describe("Kino000F worker normalization gate", () => {
  it("normalizes adapter output before Kino000E validation", () => {
    const parse = worker.indexOf("adapter.parseSnapshot");
    const normalize = worker.indexOf("normalizeCinemaParseResult(source, adapterParsed)");
    const validate = worker.indexOf("validateCinemaParseResult(source, parsed)");

    expect(parse).toBeGreaterThan(-1);
    expect(normalize).toBeGreaterThan(parse);
    expect(validate).toBeGreaterThan(normalize);
  });

  it("persists normalized rows rather than raw adapter rows", () => {
    expect(worker).toContain("const parsed = normalizeCinemaParseResult(source, adapterParsed)");
    expect(worker).toContain("normalized_payload: row");
  });
});
