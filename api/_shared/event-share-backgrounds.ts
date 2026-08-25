import type { EventArtworkInput } from "./event-artwork.js";
import { resolveEventArtworkCode } from "./event-artwork.js";

export const eventShareBackgroundUrls = {
  VB: new URL("../../images/activities/share-4x3/01-volleyball.webp", import.meta.url),
  FB: new URL("../../images/activities/share-4x3/02-football.webp", import.meta.url),
  BB: new URL("../../images/activities/share-4x3/03-basketball.webp", import.meta.url),
  TN: new URL("../../images/activities/share-4x3/04-tennis.webp", import.meta.url),
  GY: new URL("../../images/activities/share-4x3/05-gym.webp", import.meta.url),
  RN: new URL("../../images/activities/share-4x3/06-running.webp", import.meta.url),
  CY: new URL("../../images/activities/share-4x3/07-cycling.webp", import.meta.url),
  BD: new URL("../../images/activities/share-4x3/08-badminton.webp", import.meta.url),
  TT: new URL("../../images/activities/share-4x3/09-table-tennis.webp", import.meta.url),
  YG: new URL("../../images/activities/share-4x3/10-yoga.webp", import.meta.url),
  CF: new URL("../../images/activities/share-4x3/11-coffee.webp", import.meta.url),
  MV: new URL("../../images/activities/share-4x3/12-cinema.webp", import.meta.url),
  BW: new URL("../../images/activities/share-4x3/13-bowling.webp", import.meta.url),
  BG: new URL("../../images/activities/share-4x3/14-board-games.webp", import.meta.url),
  CH: new URL("../../images/activities/share-4x3/15-chess.webp", import.meta.url),
  KR: new URL("../../images/activities/share-4x3/16-karaoke.webp", import.meta.url),
  SK: new URL("../../images/activities/share-4x3/17-roller-skating.webp", import.meta.url),
  BR: new URL("../../images/activities/share-4x3/18-beer.webp", import.meta.url),
  QZ: new URL("../../images/activities/share-4x3/19-pub-quiz.webp", import.meta.url),
  WN: new URL("../../images/activities/share-4x3/20-wine-evening.webp", import.meta.url),
  CN: new URL("../../images/activities/share-4x3/21-concert.webp", import.meta.url),
  FS: new URL("../../images/activities/share-4x3/22-festival.webp", import.meta.url),
  DN: new URL("../../images/activities/share-4x3/23-dancing.webp", import.meta.url),
  HK: new URL("../../images/activities/share-4x3/24-hiking.webp", import.meta.url),
  WK: new URL("../../images/activities/share-4x3/25-park-walk.webp", import.meta.url),
  SW: new URL("../../images/activities/share-4x3/26-swimming.webp", import.meta.url),
  PC: new URL("../../images/activities/share-4x3/27-picnic.webp", import.meta.url),
  CP: new URL("../../images/activities/share-4x3/28-camping.webp", import.meta.url),
  FI: new URL("../../images/activities/share-4x3/29-fishing.webp", import.meta.url),
  KY: new URL("../../images/activities/share-4x3/30-kayaking.webp", import.meta.url),
  CT: new URL("../../images/activities/share-4x3/31-city-walk.webp", import.meta.url),
  DR: new URL("../../images/activities/share-4x3/32-dinner.webp", import.meta.url),
  LX: new URL("../../images/activities/share-4x3/33-language-exchange.webp", import.meta.url),
  CW: new URL("../../images/activities/share-4x3/34-coworking.webp", import.meta.url),
  MT: new URL("../../images/activities/share-4x3/35-new-connections.webp", import.meta.url),
  AR: new URL("../../images/activities/share-4x3/36-drawing.webp", import.meta.url),
  PH: new URL("../../images/activities/share-4x3/37-photo-walk.webp", import.meta.url),
  CR: new URL("../../images/activities/share-4x3/38-ceramics.webp", import.meta.url),
  JM: new URL("../../images/activities/share-4x3/39-music-jam.webp", import.meta.url),
  WS: new URL("../../images/activities/share-4x3/40-workshop.webp", import.meta.url),
} as const;

export const serviceShareBackgroundUrls = {
  manicure: new URL("../../images/services/share-6x5/s-01-manicure.webp", import.meta.url),
} as const;

export type EventShareBackgroundCode = keyof typeof eventShareBackgroundUrls;

const isManicure = ({ activity = "", title = "" }: EventArtworkInput) =>
  /manicure|маникюр|манікюр|manik[uú]ra/i.test(`${activity} ${title}`);

export const resolveEventShareBackgroundUrl = (input: EventArtworkInput) => {
  if (isManicure(input)) return serviceShareBackgroundUrls.manicure;
  const code = resolveEventArtworkCode(input);
  return (eventShareBackgroundUrls as Partial<Record<string, URL>>)[code] || null;
};
