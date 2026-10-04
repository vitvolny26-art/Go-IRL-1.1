import { describe, expect, it } from "vitest";
import {
  cinemaSourceMonitoringReady,
  classifyCinemaSourceHealth,
  isCinemaSourceAdapterBindingAllowed,
  kino000bOlomoucSourceRegistry,
} from "../api/_shared/cinema-source-registry";

describe("Kino000B cinema source registry contract", () => {
  it("declares the four Olomouc source contracts without activating them", () => {
    expect(kino000bOlomoucSourceRegistry.map((entry) => entry.sourceId)).toEqual([
      "cinemax_cz",
      "cinestar_cz",
      "kinometropol_cz",
      "premiere_cinemas_cz",
    ]);
    expect(kino000bOlomoucSourceRegistry.every((entry) => entry.fetchIntervalMinutes === 1440)).toBe(true);
  });

  it("fails closed when a known source is paired with the wrong adapter", () => {
    expect(isCinemaSourceAdapterBindingAllowed("cinestar_cz", "premiere_cz")).toBe(false);
    expect(isCinemaSourceAdapterBindingAllowed("premiere_cinemas_cz", "premiere_cz")).toBe(true);
  });

  it("classifies an unregistered adapter as quarantined", () => {
    expect(classifyCinemaSourceHealth({
      sourceId: "kinometropol_cz",
      adapterKey: "metropol_entradio_cz",
      sourceEnabled: false,
      venueActive: true,
      monitorEnabled: false,
      consecutiveFailures: 0,
      lastFetchStatus: "success",
      lastSuccessAt: "2026-10-04T09:37:44.000Z",
      lastParseStatus: "success",
      scopeComplete: true,
    })).toBe("quarantined");
  });

  it("separates health from activation and requires every monitoring gate", () => {
    expect(cinemaSourceMonitoringReady({
      sourceEnabled: false,
      venueActive: true,
      monitorEnabled: false,
      sourceId: "premiere_cinemas_cz",
      adapterKey: "premiere_cz",
    })).toBe(false);
  });
});
