import type {
  CinemaNormalizedScreening,
  CinemaParseResult,
  CinemaSourceConfig,
} from "./cinema-ingestion-types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

const validTimezone = (value: string) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const localDate = (value: string) => LOCAL_DATE_TIME.test(value) ? value.slice(0, 10) : null;

const unique = <T>(values: T[]) => [...new Set(values)];

const rowIssues = (source: CinemaSourceConfig, row: CinemaNormalizedScreening) => {
  const issues: string[] = [];
  if (!row.external_movie_id?.trim()) issues.push("external_movie_id_missing");
  if (!row.movie_fingerprint?.trim()) issues.push("movie_fingerprint_missing");
  if (!row.title?.trim()) issues.push("title_missing");
  if (!row.screening_fingerprint?.trim()) issues.push("screening_fingerprint_missing");
  if (!LOCAL_DATE_TIME.test(row.starts_at_local || "")) issues.push("starts_at_local_invalid");
  if (!validTimezone(row.timezone || "")) issues.push("timezone_invalid");
  if (row.timezone !== source.timezone) issues.push("timezone_source_mismatch");
  if (!row.starts_at || Number.isNaN(Date.parse(row.starts_at))) issues.push("starts_at_invalid");
  return unique(issues);
};

export type CinemaParseValidation = {
  scopeComplete: boolean;
  status: "success" | "quarantined";
  issues: string[];
  rowValidationErrors: string[][];
  errorMessage: string | null;
  metrics: Record<string, unknown>;
};

export function validateCinemaParseResult(
  source: CinemaSourceConfig,
  parsed: CinemaParseResult,
): CinemaParseValidation {
  const issues: string[] = [];
  const rowValidationErrors = parsed.rows.map((row) => rowIssues(source, row));

  if (!Number.isInteger(parsed.records_parsed) || parsed.records_parsed < 0) issues.push("records_parsed_invalid");
  if (!Number.isInteger(parsed.records_valid) || parsed.records_valid < 0) issues.push("records_valid_invalid");
  if (!Number.isInteger(parsed.records_rejected) || parsed.records_rejected < 0) issues.push("records_rejected_invalid");
  if (parsed.records_valid !== parsed.rows.length) issues.push("records_valid_row_count_mismatch");
  if (parsed.records_parsed < parsed.records_valid) issues.push("records_parsed_lt_valid");
  if (parsed.records_parsed < parsed.records_rejected) issues.push("records_parsed_lt_rejected");
  if (parsed.records_parsed !== parsed.records_valid + parsed.records_rejected) {
    issues.push("records_parsed_total_mismatch");
  }

  if (parsed.fatal_error) issues.push("fatal_error");
  if (parsed.zero_result !== (parsed.rows.length === 0)) issues.push("zero_result_mismatch");

  const fingerprints = parsed.rows.map((row) => row.screening_fingerprint).filter(Boolean);
  if (new Set(fingerprints).size !== fingerprints.length) issues.push("duplicate_screening_fingerprint");

  if (rowValidationErrors.some((row) => row.length > 0)) issues.push("row_validation_failed");

  const dates = parsed.rows.map((row) => localDate(row.starts_at_local)).filter((value): value is string => Boolean(value)).sort();
  const minDate = dates[0] || null;
  const maxDate = dates.at(-1) || null;

  if (parsed.min_schedule_date !== minDate) issues.push("min_schedule_date_mismatch");
  if (parsed.max_schedule_date !== maxDate) issues.push("max_schedule_date_mismatch");
  if (!ISO_DATE.test(parsed.expected_until || "")) issues.push("expected_until_invalid");

  const enoughRecords = parsed.records_valid >= source.min_records;
  const horizonCovered = Boolean(maxDate && ISO_DATE.test(parsed.expected_until || "") && maxDate >= parsed.expected_until);
  const computedScopeComplete = Boolean(
    parsed.fetch_complete &&
    parsed.parser_complete &&
    !parsed.fatal_error &&
    !parsed.zero_result &&
    enoughRecords &&
    horizonCovered &&
    issues.length === 0
  );

  if (parsed.scope_complete !== computedScopeComplete) issues.push("scope_complete_contract_mismatch");

  const scopeComplete = parsed.scope_complete === true && computedScopeComplete && issues.length === 0;
  const combinedErrors = unique([
    ...parsed.errors.filter((value) => typeof value === "string" && value.trim()),
    ...issues,
  ]);

  return {
    scopeComplete,
    status: scopeComplete ? "success" : "quarantined",
    issues,
    rowValidationErrors,
    errorMessage: combinedErrors.length ? combinedErrors.join(" | ").slice(0, 4000) : null,
    metrics: {
      ...parsed.metrics,
      parse_contract_version: "kino000e-v1",
      contract_issues: issues,
      rows_with_validation_errors: rowValidationErrors.filter((row) => row.length > 0).length,
      enough_records: enoughRecords,
      horizon_covered: horizonCovered,
      computed_scope_complete: computedScopeComplete,
      adapter_scope_complete: parsed.scope_complete,
    },
  };
}
