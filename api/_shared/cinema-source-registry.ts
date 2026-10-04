import { registeredCinemaAdapterKeys } from "./cinema-adapters/register.js";

export type CinemaSourceHealthStatus = "healthy" | "partial" | "failing" | "quarantined";

export type CinemaSourceRegistryContract = {
  sourceId: string;
  cityId: string;
  venueName: string;
  adapterKey: string;
  expectedHorizonDays: number;
  fetchIntervalMinutes: number;
};

export const kino000bOlomoucSourceRegistry: readonly CinemaSourceRegistryContract[] = [
  {
    sourceId: "cinemax_cz",
    cityId: "olomouc",
    venueName: "CINEMAX OLOMOUC OLYMPIA",
    adapterKey: "cinemax_cz_ajax",
    expectedHorizonDays: 9,
    fetchIntervalMinutes: 1440,
  },
  {
    sourceId: "cinestar_cz",
    cityId: "olomouc",
    venueName: "CineStar Olomouc",
    adapterKey: "cinestar_cz",
    expectedHorizonDays: 5,
    fetchIntervalMinutes: 1440,
  },
  {
    sourceId: "kinometropol_cz",
    cityId: "olomouc",
    venueName: "Kino METROPOL",
    adapterKey: "metropol_entradio_cz",
    expectedHorizonDays: 30,
    fetchIntervalMinutes: 1440,
  },
  {
    sourceId: "premiere_cinemas_cz",
    cityId: "olomouc",
    venueName: "Premiere Cinemas Olomouc",
    adapterKey: "premiere_cz",
    expectedHorizonDays: 5,
    fetchIntervalMinutes: 1440,
  },
] as const;

const expectedAdapterBySourceId = new Map(
  kino000bOlomoucSourceRegistry.map((entry) => [entry.sourceId, entry.adapterKey]),
);

export function isCinemaSourceAdapterBindingAllowed(sourceId: string, adapterKey: string) {
  const expected = expectedAdapterBySourceId.get(sourceId);
  return expected ? expected === adapterKey : true;
}

export type CinemaSourceHealthInput = {
  sourceId: string;
  adapterKey: string;
  sourceEnabled: boolean;
  venueActive: boolean;
  monitorEnabled: boolean;
  consecutiveFailures: number;
  lastFetchStatus: string | null;
  lastSuccessAt: string | null;
  lastParseStatus: string | null;
  scopeComplete: boolean | null;
};

export function classifyCinemaSourceHealth(input: CinemaSourceHealthInput): CinemaSourceHealthStatus {
  const registered = new Set(registeredCinemaAdapterKeys);
  if (!registered.has(input.adapterKey)) return "quarantined";
  if (!isCinemaSourceAdapterBindingAllowed(input.sourceId, input.adapterKey)) return "quarantined";
  if (!input.venueActive) return "quarantined";
  if (input.lastParseStatus === "quarantined" || input.scopeComplete === false) return "quarantined";
  if (input.consecutiveFailures >= 3 || input.lastFetchStatus === "failed") return "failing";
  if (input.lastFetchStatus === "partial" || input.lastParseStatus === "failed") return "partial";
  if (!input.lastSuccessAt) return "partial";
  return "healthy";
}

export function cinemaSourceMonitoringReady(input: {
  sourceEnabled: boolean;
  venueActive: boolean;
  monitorEnabled: boolean;
  sourceId: string;
  adapterKey: string;
}) {
  return input.sourceEnabled
    && input.venueActive
    && input.monitorEnabled
    && registeredCinemaAdapterKeys.includes(input.adapterKey)
    && isCinemaSourceAdapterBindingAllowed(input.sourceId, input.adapterKey);
}
