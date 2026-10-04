import { createHash } from "node:crypto";
import type {
  CinemaRawSnapshotPayload,
  CinemaSourceConfig,
} from "./cinema-ingestion-types.js";

export type CinemaFetchStatus = "fetched" | "partial" | "failed";

type CinemaFetchSnapshotEvidenceInput = {
  source: CinemaSourceConfig;
  payload: CinemaRawSnapshotPayload;
  workerJobId: string;
};

const isHttpsUrl = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
};

export const canonicalCinemaSnapshotJson = (payload: CinemaRawSnapshotPayload) =>
  JSON.stringify(canonicalize(payload));

export const hashCinemaRawSnapshotPayload = (payload: CinemaRawSnapshotPayload) =>
  `sha256:${createHash("sha256").update(canonicalCinemaSnapshotJson(payload)).digest("hex")}`;

export function validateCinemaRawSnapshotPayload(
  source: CinemaSourceConfig,
  payload: CinemaRawSnapshotPayload,
): void {
  if (!payload || typeof payload !== "object") throw new Error("cinema_fetch_payload_invalid");
  if (payload.adapter_key !== source.adapter_key) throw new Error("cinema_fetch_adapter_mismatch");
  if (!isHttpsUrl(payload.root_url)) throw new Error("cinema_fetch_root_url_invalid");
  if (!payload.fetched_at || Number.isNaN(Date.parse(payload.fetched_at))) {
    throw new Error("cinema_fetch_timestamp_invalid");
  }
  if (!Array.isArray(payload.pages) || !Array.isArray(payload.failures)) {
    throw new Error("cinema_fetch_payload_shape_invalid");
  }
  if (payload.pages.length === 0 && payload.failures.length === 0) {
    throw new Error("cinema_fetch_empty_payload");
  }

  for (const page of payload.pages) {
    if (!isHttpsUrl(page?.url)) throw new Error("cinema_fetch_page_url_invalid");
    if (!Number.isInteger(page?.status) || page.status < 100 || page.status > 599) {
      throw new Error("cinema_fetch_page_status_invalid");
    }
    if (typeof page?.body !== "string") throw new Error("cinema_fetch_page_body_invalid");
  }

  for (const failure of payload.failures) {
    if (!isHttpsUrl(failure?.url)) throw new Error("cinema_fetch_failure_url_invalid");
    if (typeof failure?.error !== "string" || !failure.error.trim()) {
      throw new Error("cinema_fetch_failure_error_invalid");
    }
  }
}

export const classifyCinemaFetchStatus = (payload: CinemaRawSnapshotPayload): CinemaFetchStatus =>
  payload.pages.length === 0
    ? "failed"
    : payload.failures.length > 0
      ? "partial"
      : "fetched";

export const cinemaFetchDownstreamPlan = (fetchStatus: CinemaFetchStatus) => ({
  archiveDrive: true,
  parse: fetchStatus !== "failed",
});

export function buildCinemaFetchSnapshotEvidence({
  source,
  payload,
  workerJobId,
}: CinemaFetchSnapshotEvidenceInput) {
  validateCinemaRawSnapshotPayload(source, payload);

  const fetchStatus = classifyCinemaFetchStatus(payload);
  const contentHash = hashCinemaRawSnapshotPayload(payload);
  const httpStatus = payload.pages[0]?.status ?? null;

  return {
    fetchStatus,
    contentHash,
    row: {
      source_config_id: source.id,
      venue_id: source.venue_id,
      source_id: source.source_id,
      source_url: payload.root_url,
      fetched_at: payload.fetched_at,
      http_status: httpStatus,
      fetch_status: fetchStatus,
      raw_format: "json",
      raw_payload: payload,
      content_hash: contentHash,
      parser_version: source.parser_version,
      error_message: payload.failures.length
        ? payload.failures.map((failure) => `${failure.url}:${failure.error}`).join(" | ").slice(0, 2000)
        : null,
      metadata: {
        worker_job_id: workerJobId,
        adapter_key: source.adapter_key,
        fetched_pages: payload.pages.length,
        fetch_failures: payload.failures.length,
      },
    },
  };
}
