export type CinemaSourceRegistryHealth = "healthy" | "partial" | "failing" | "quarantined";

export type CinemaSourceRegistryRow = {
  id: string;
  venue_id: string;
  source_id: string;
  adapter_key: string;
  source_url: string;
  parser_version: string;
  timezone: string;
  enabled: boolean;
  fetch_interval_minutes: number;
  expected_horizon_days: number;
  min_records: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  consecutive_failures: number;
  cinema_venues: {
    city_id: string;
    city_name: string;
    active: boolean;
    monitor_enabled: boolean;
    trust_score: number | string | null;
    last_fetch_status: string | null;
    schedule_known_until: string | null;
    timezone: string;
  } | null;
};

export type CinemaSourceRegistryInspection = {
  adapterRegistered: boolean;
  configurationReady: boolean;
  currentlyMonitorable: boolean;
  health: CinemaSourceRegistryHealth;
  reasons: string[];
};

const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

const isHttpsUrl = (value: unknown) => {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const localDate = (instant: Date, timezone: string) => {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(instant);
  } catch {
    return null;
  }
};

export function inspectCinemaSourceRegistryRow(
  source: CinemaSourceRegistryRow,
  registeredAdapterKeys: ReadonlySet<string>,
  now: Date = new Date(),
): CinemaSourceRegistryInspection {
  const venue = source.cinema_venues;
  const reasons: string[] = [];
  const adapterRegistered = registeredAdapterKeys.has(source.adapter_key);

  if (!adapterRegistered) reasons.push("adapter_unregistered");
  if (!source.source_id || source.source_id.length > 120) reasons.push("source_id_invalid");
  if (!source.adapter_key || source.adapter_key.length > 120) reasons.push("adapter_key_invalid");
  if (!isHttpsUrl(source.source_url)) reasons.push("source_url_invalid");
  if (!source.parser_version || source.parser_version.length > 80) reasons.push("parser_version_invalid");
  if (!Number.isInteger(source.fetch_interval_minutes) || source.fetch_interval_minutes < 60 || source.fetch_interval_minutes > 10_080) {
    reasons.push("fetch_interval_invalid");
  }
  if (!Number.isInteger(source.expected_horizon_days) || source.expected_horizon_days < 1 || source.expected_horizon_days > 31) {
    reasons.push("expected_horizon_invalid");
  }
  if (!Number.isInteger(source.min_records) || source.min_records < 0) reasons.push("min_records_invalid");
  if (!Number.isInteger(source.consecutive_failures) || source.consecutive_failures < 0) reasons.push("failure_counter_invalid");
  if (!venue) reasons.push("venue_missing");

  const sourceDate = localDate(now, source.timezone);
  const venueDate = venue ? localDate(now, venue.timezone) : null;
  if (!sourceDate) reasons.push("source_timezone_invalid");
  if (venue && !venueDate) reasons.push("venue_timezone_invalid");
  if (venue && source.timezone !== venue.timezone) reasons.push("timezone_mismatch");
  if (venue && (!Number.isFinite(Number(venue.trust_score)) || Number(venue.trust_score) < 0 || Number(venue.trust_score) > 100)) {
    reasons.push("trust_score_invalid");
  }

  const configurationReady = reasons.length === 0;
  const currentlyMonitorable = Boolean(
    configurationReady
    && source.enabled
    && venue?.active
    && venue?.monitor_enabled
  );

  let health: CinemaSourceRegistryHealth;
  if (!configurationReady || !venue?.active) {
    health = "quarantined";
  } else if (source.consecutive_failures >= 2 || venue.last_fetch_status === "failed") {
    health = "failing";
  } else {
    const scheduleKnownUntil = venue.schedule_known_until;
    const scheduleStale = Boolean(
      sourceDate
      && typeof scheduleKnownUntil === "string"
      && dateOnly.test(scheduleKnownUntil)
      && scheduleKnownUntil < sourceDate
    );
    if (
      source.consecutive_failures === 1
      || venue.last_fetch_status === "partial"
      || !source.last_success_at
      || scheduleStale
    ) health = "partial";
    else health = "healthy";
  }

  return {
    adapterRegistered,
    configurationReady,
    currentlyMonitorable,
    health,
    reasons,
  };
}
