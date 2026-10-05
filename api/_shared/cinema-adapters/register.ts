import { cinemaAdapters } from "./premiere-cz.js";
import { cinestarCzAdapter } from "./cinestar-cz.js";
import { withCineStarPromotions } from "./cinestar-promotions.js";
import { cinemaxCzAdapter } from "./cinemax-cz.js";
import { planetaKinoUaAdapter } from "./planeta-kino-ua.js";
import { cinemacityGlobalAdapter } from "./cinemacity-global.js";
import { multiplexUaAdapter } from "./multiplex-ua.js";

const register = (key: string, adapter: (typeof cinemaAdapters)[string]) => {
  const existing = cinemaAdapters[key];
  if (existing && existing !== adapter) throw new Error(`cinema_adapter_duplicate:${key}`);
  cinemaAdapters[key] = adapter;
};

const cinestarWithPromotions = withCineStarPromotions(cinestarCzAdapter);
register(cinestarWithPromotions.key, cinestarWithPromotions);
register(cinemaxCzAdapter.key, cinemaxCzAdapter);
register(planetaKinoUaAdapter.key, planetaKinoUaAdapter);
register(cinemacityGlobalAdapter.key, cinemacityGlobalAdapter);
register(multiplexUaAdapter.key, multiplexUaAdapter);

export const registeredCinemaAdapterKeys = Object.keys(cinemaAdapters).sort();
