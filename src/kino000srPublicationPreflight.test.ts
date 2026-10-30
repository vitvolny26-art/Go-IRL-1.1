import { describe, expect, it } from "vitest";
import { prepareSrPolicyHandoff } from "../api/_shared/cinema-sr-policy-handoff";
import { evaluateSrHandoff, validateSrHandoff } from "../api/_shared/cinema-sr-publication-preflight";

const id = "123e4567-e89b-42d3-a456-426614174000";
const input = () => ({
  catalog_movie_id: id,
  week_key: "2026-10-22..2026-11-04", run_id: "source-run-51710",
  candidate_id: "source:cinema:film-1", rank: 1,
  mode: "top7_automatic_target" as const, screening_count: 2,
  showing_from: "2026-10-30", showing_until: "2026-11-04", release_enabled: false as const,
});
const movie = () => ({
  id, city_id: "olomouc", selection_week_start: "2026-10-22", selection_week_end: "2026-11-04", rank: 1,
  source_movie_key: "source:cinema:film-1", poster_url: "https://example.org/poster.jpg",
  publication_state: "ready",
  translations: Object.fromEntries(["ru", "uk", "cs", "en", "pl", "sk"].map(language => [language, { title: "Film", description: "Summary" }])),
  readiness: {
    ready: true, verified_source_run_id: "source-run-51710", source_identity_verified: true,
    poster_provenance_verified: true, screening_horizon_complete: true,
    localizations_provenance_verified: true,
  },
});
const screenings = () => [
  { catalog_movie_id: id, source_screening_key: "source-a|one", cinema_key: "cinema", venue_timezone: "Europe/Prague", starts_at: "2026-10-30T12:00:00Z", source_id: "source-a", source_url: "https://example.org/s1" },
  { catalog_movie_id: id, source_screening_key: "source-a|two", cinema_key: "cinema", venue_timezone: "Europe/Prague", starts_at: "2026-11-04T12:00:00Z", source_id: "source-a", source_url: "https://example.org/s2" },
];

describe("Kino000(SR) evidence preflight (no publication)", () => {
  it("checks complete persisted evidence but never authorizes publication", () => {
    const v = evaluateSrHandoff(validateSrHandoff(input()), movie(), screenings());
    expect(v).toMatchObject({ evidence_complete: true, blockers: [], publication_authorized: false, telegram_send_authorized: false, release_enabled: false, policy_route: "top7_automatic_individual", individual_telegram_request_required: false, exact_movie_server_policy_gate_required: true, operator_release_gate_required: true });
  });
  it("rejects missing UUID, batch shape and attempted activation", () => {
    expect(() => validateSrHandoff({ ...input(), catalog_movie_id: "" })).toThrow("cinema_sr_catalog_uuid_missing_or_invalid");
    expect(() => validateSrHandoff([input()])).toThrow("cinema_sr_handoff_invalid_shape");
    expect(() => validateSrHandoff({ ...input(), release_enabled: true })).toThrow("cinema_sr_release_must_remain_disabled");
  });
  it("keeps Top8-10 request-only and rejects mode spoofing", () => {
    expect(() => validateSrHandoff({ ...input(), rank: 8 })).toThrow("cinema_sr_rank_mode_mismatch");
    const v = validateSrHandoff({ ...input(), rank: 8, mode: "top8_10_telegram_request_only" });
    expect(v.mode).toBe("top8_10_telegram_request_only");
  });
  it("blocks mismatched identity, rank and week", () => {
    const v = evaluateSrHandoff(validateSrHandoff(input()), { ...movie(), rank: 2, source_movie_key: "other", selection_week_end: "2026-11-05" }, screenings());
    expect(v.blockers).toEqual(expect.arrayContaining(["catalog_rank_mismatch", "source_movie_identity_mismatch", "selection_week_mismatch"]));
  });
  it("blocks missing source evidence and non-HTTPS screening links", () => {
    const m = movie(); m.readiness.poster_provenance_verified = false;
    const s = screenings(); s[0].source_url = "http://example.org/s1";
    const v = evaluateSrHandoff(validateSrHandoff(input()), m, s);
    expect(v.blockers).toEqual(expect.arrayContaining(["poster_provenance_unverified", "screening_source_provenance_missing"]));
  });
  it("prepares an exact top7 automatic POLICY handoff without granting publication", () => {
    const handoff = validateSrHandoff(input());
    const preflight = evaluateSrHandoff(handoff, movie(), screenings());
    const policy = prepareSrPolicyHandoff(handoff, preflight);
    expect(policy).toMatchObject({
      route: "top7_automatic_individual", rank: 1, catalog_movie_id: id,
      individual_telegram_request_required: false, policy_eligible: true,
      action: "none", publication_authorized: false, telegram_send_authorized: false,
    });
  });
  it("makes rank 8 an exact owner Telegram request, never automatic", () => {
    const handoff = validateSrHandoff({ ...input(), rank: 8, mode: "top8_10_telegram_request_only" });
    const preflight = evaluateSrHandoff(handoff, { ...movie(), rank: 8 }, screenings());
    const policy = prepareSrPolicyHandoff(handoff, preflight);
    expect(policy).toMatchObject({
      route: "top8_10_exact_telegram_request", individual_telegram_request_required: true,
      action: "none", release_enabled: false,
    });
  });
  it("refuses a changed UUID, rank or mode across preflight and policy", () => {
    const handoff = validateSrHandoff(input());
    const preflight = evaluateSrHandoff(handoff, movie(), screenings());
    expect(() => prepareSrPolicyHandoff({ ...handoff, catalog_movie_id: "123e4567-e89b-42d3-a456-426614174001" }, preflight)).toThrow("cinema_sr_policy_identity_changed");
    expect(() => prepareSrPolicyHandoff({ ...handoff, rank: 2 }, preflight)).toThrow("cinema_sr_policy_identity_changed");
  });
  it("retains no-action status even when source evidence is missing", () => {
    const handoff = validateSrHandoff(input());
    const preflight = evaluateSrHandoff(handoff, { ...movie(), poster_url: null }, screenings());
    const policy = prepareSrPolicyHandoff(handoff, preflight);
    expect(policy.policy_eligible).toBe(false);
    expect(policy.blockers).toContain("poster_https_missing");
    expect(policy.publication_authorized).toBe(false);
  });
  it("rejects cross-city catalog readback even when exact UUID matches", () => {
    const v = evaluateSrHandoff(validateSrHandoff(input()), { ...movie(), city_id: "prague" }, screenings());
    expect(v.blockers).toContain("catalog_city_mismatch");
  });
  it("rejects screening source namespace mismatch and timezone-naive timestamps", () => {
    const s = screenings(); s[0].source_screening_key = "other|one";
    s[1].starts_at = "2026-11-04T12:00:00";
    const v = evaluateSrHandoff(validateSrHandoff(input()), movie(), s);
    expect(v.blockers).toEqual(expect.arrayContaining(["screening_source_identity_mismatch", "screening_date_or_timezone_invalid"]));
  });
  it("blocks duplicate screenings and wrong full-horizon showing dates", () => {
    const s = screenings(); s[1].source_screening_key = s[0].source_screening_key;
    s[1].starts_at = "2026-10-31T12:00:00Z";
    const v = evaluateSrHandoff(validateSrHandoff(input()), movie(), s);
    expect(v.blockers).toEqual(expect.arrayContaining(["screening_key_invalid_or_duplicate", "actual_screening_range_mismatch"]));
  });
});
