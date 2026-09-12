import { cinemaAdapters } from "./premiere-cz.js";
import { cinestarCzAdapter } from "./cinestar-cz.js";

const register = (key: string, adapter: (typeof cinemaAdapters)[string]) => {
  const existing = cinemaAdapters[key];
  if (existing && existing !== adapter) throw new Error(`cinema_adapter_duplicate:${key}`);
  cinemaAdapters[key] = adapter;
};

register(cinestarCzAdapter.key, cinestarCzAdapter);

export const registeredCinemaAdapterKeys = Object.keys(cinemaAdapters).sort();
