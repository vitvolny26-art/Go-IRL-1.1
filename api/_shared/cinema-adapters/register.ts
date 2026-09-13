import { cinemaAdapters } from "./premiere-cz.js";
import { cinestarCzAdapter } from "./cinestar-cz.js";
import { cinemaxCzAdapter } from "./cinemax-cz.js";

const register = (key: string, adapter: (typeof cinemaAdapters)[string]) => {
  const existing = cinemaAdapters[key];
  if (existing && existing !== adapter) throw new Error(`cinema_adapter_duplicate:${key}`);
  cinemaAdapters[key] = adapter;
};

register(cinestarCzAdapter.key, cinestarCzAdapter);
register(cinemaxCzAdapter.key, cinemaxCzAdapter);

export const registeredCinemaAdapterKeys = Object.keys(cinemaAdapters).sort();
