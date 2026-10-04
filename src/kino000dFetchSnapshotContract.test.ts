import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const worker = readFileSync(
  new URL("../api/_shared/cinema-ingestion-worker.ts", import.meta.url),
  "utf8",
);
const helper = readFileSync(
  new URL("../api/_shared/cinema-fetch-snapshot.ts", import.meta.url),
  "utf8",
);

describe("Kino000D worker integration contract", () => {
  it("persists snapshot evidence before any archive or parse enqueue", () => {
    const insert = worker.indexOf('.from("cinema_source_snapshots")');
    const plan = worker.indexOf("cinemaFetchDownstreamPlan(fetchStatus)");
    const archive = worker.indexOf('job_type: "ARCHIVE_DRIVE"');
    const parse = worker.indexOf('job_type: "PARSE"');

    expect(insert).toBeGreaterThan(-1);
    expect(plan).toBeGreaterThan(insert);
    expect(archive).toBeGreaterThan(plan);
    expect(parse).toBeGreaterThan(archive);
  });

  it("uses the bounded fetch evidence builder rather than ad-hoc snapshot hashing", () => {
    expect(worker).toContain("buildCinemaFetchSnapshotEvidence");
    expect(worker).toContain(".insert(evidence.row)");
    expect(worker).not.toContain("const rawJson = JSON.stringify(payload)");
    expect(helper).toContain('raw_format: "json"');
    expect(helper).toContain("content_hash: contentHash");
    expect(helper).toContain("raw_payload: payload");
  });

  it("keeps failed fetches out of PARSE while preserving archive evidence", () => {
    expect(helper).toContain('archiveDrive: true');
    expect(helper).toContain('parse: fetchStatus !== "failed"');
  });
});
