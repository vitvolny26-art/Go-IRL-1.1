import { materialEventArtworkPaths } from "./material-event-artwork.js";

export type EventArtworkInput = {
  icon?: string;
  activity?: string;
  title?: string;
};

type EventArtworkEntry = {
  code: string;
  emoji: string;
  aliases: readonly string[];
};

const normalize = (value: string) => value
  .toLocaleLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[’']/g, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim();

export const eventArtworkRegistry: readonly EventArtworkEntry[] = [
  { code: "VB", emoji: "🏐", aliases: ["volleyball", "волейбол", "volejbal"] },
  { code: "FB", emoji: "⚽", aliases: ["football", "футбол", "fotbal"] },
  { code: "BB", emoji: "🏀", aliases: ["basketball", "баскетбол", "basketbal"] },
  { code: "TN", emoji: "🎾", aliases: ["tennis", "теннис", "теніс", "tenis"] },
  { code: "GY", emoji: "🏋️", aliases: ["gym", "тренажерный зал", "тренажерний зал", "posilovna"] },
  { code: "RN", emoji: "🏃", aliases: ["running", "бег", "біг", "beh"] },
  { code: "CY", emoji: "🚴", aliases: ["cycling", "велосипед", "kolo"] },
  { code: "BD", emoji: "🏸", aliases: ["badminton", "бадминтон", "бадмінтон"] },
  { code: "TT", emoji: "🏓", aliases: ["table tennis", "настольный теннис", "настільний теніс", "stolni tenis"] },
  { code: "YG", emoji: "🧘", aliases: ["yoga", "йога", "joga"] },
  { code: "CF", emoji: "☕", aliases: ["coffee", "кофе", "kava"] },
  { code: "MV", emoji: "🎬", aliases: ["cinema", "кино", "kino"] },
  { code: "BW", emoji: "🎳", aliases: ["bowling", "боулинг"] },
  { code: "BG", emoji: "🎲", aliases: ["board games", "настольные игры", "deskove hry"] },
  { code: "CH", emoji: "♟️", aliases: ["chess", "шахматы", "sachy"] },
  { code: "KR", emoji: "🎤", aliases: ["karaoke", "караоке"] },
  { code: "SK", emoji: "🛼", aliases: ["inline skating", "ролики", "inline brusleni"] },
  { code: "BR", emoji: "🍺", aliases: ["lets get a beer", "идем на пиво", "jdeme na pivo"] },
  { code: "QZ", emoji: "🧠", aliases: ["pub quiz", "паб квиз", "pub kviz"] },
  { code: "WN", emoji: "🍷", aliases: ["wine evening", "винный вечер", "vecer s vinem"] },
  { code: "CN", emoji: "🎵", aliases: ["concert", "концерт", "koncert"] },
  { code: "FS", emoji: "🎪", aliases: ["festival", "фестиваль"] },
  { code: "DN", emoji: "💃", aliases: ["dancing", "танцы", "tanec"] },
  { code: "HK", emoji: "🥾", aliases: ["hike", "поход", "vylet"] },
  { code: "WK", emoji: "🚶", aliases: ["park walk", "прогулка в парке", "prochazka v parku"] },
  { code: "CT", emoji: "🚶", aliases: ["city walk", "walk", "городская прогулка", "прогулка", "mestska prochazka", "prochazka"] },
  { code: "SW", emoji: "🏊", aliases: ["swimming", "плавание", "plavani"] },
  { code: "PC", emoji: "🧺", aliases: ["picnic", "пикник", "piknik"] },
  { code: "CP", emoji: "⛺", aliases: ["camping", "кемпинг", "kempovani"] },
  { code: "FI", emoji: "🎣", aliases: ["fishing", "рыбалка", "rybareni"] },
  { code: "KY", emoji: "🛶", aliases: ["kayaking", "каяки", "kajaky"] },
  { code: "DR", emoji: "🍽️", aliases: ["dinner", "ужин", "vecere"] },
  { code: "LX", emoji: "🗣️", aliases: ["language exchange", "языковой обмен", "jazykova vymena"] },
  { code: "CW", emoji: "💻", aliases: ["coworking", "коворкинг"] },
  { code: "MT", emoji: "🤝", aliases: ["meet new people", "новые знакомства", "nova seznameni"] },
  { code: "AR", emoji: "🎨", aliases: ["drawing", "рисование", "malovani"] },
  { code: "PH", emoji: "📸", aliases: ["photo walk", "фотопрогулка", "fotoprochazka"] },
  { code: "CR", emoji: "🏺", aliases: ["ceramics", "керамика", "keramika"] },
  { code: "JM", emoji: "🎸", aliases: ["music jam", "музыкальный джем", "hudebni jam"] },
  { code: "WS", emoji: "🧶", aliases: ["workshop", "мастерская", "dilna"] },
] as const;

const aliasIndex = eventArtworkRegistry
  .flatMap((entry) => entry.aliases.map((value) => ({ code: entry.code, value: normalize(value) })))
  .sort((left, right) => right.value.length - left.value.length);

const betaArtwork: Readonly<Record<string, string>> = {
  BR: `<g data-branded-artwork="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M151 145h62v89c0 14-11 25-25 25h-12c-14 0-25-11-25-25z" fill="#c9ff3d" stroke="#efffc0" stroke-width="8"/>
    <path d="M213 163h16c25 0 25 45 0 45h-16" stroke="#c9ff3d" stroke-width="12"/>
    <path d="M163 171h38M163 192h38" stroke="#10170b" stroke-width="8" opacity=".75"/>
    <path d="M156 146c4-16 25-18 32-4 9-13 30-7 29 10" fill="#efffc0" stroke="#efffc0" stroke-width="7"/>
  </g>`,
  VB: `<g data-branded-artwork="true" fill="none" stroke="#c9ff3d" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="191" cy="191" r="63" fill="#151d12" stroke="#efffc0" stroke-width="8"/>
    <path d="M150 145c24 5 43 18 58 38M184 130c10 28 9 56-5 82M232 145c-7 24-22 43-46 57M134 191c27-4 51 1 74 18M213 245c-2-22-11-41-28-58" stroke-width="9"/>
  </g>`,
  RN: `<g data-branded-artwork="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="199" cy="145" r="15" fill="#efffc0"/>
    <path d="M186 165l-18 40 35 17 25-42-22-15z" fill="#c9ff3d"/>
    <path d="M177 181l-34 23M218 177l31 19M194 221l-22 39M203 224l38 31" stroke="#efffc0" stroke-width="13"/>
  </g>`,
  WK: `<g data-branded-artwork="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="191" cy="145" r="15" fill="#efffc0"/>
    <path d="M178 165h27l7 49h-40z" fill="#c9ff3d"/>
    <path d="M179 181l-28 25M205 181l25 27M184 213l-18 43M199 213l23 43" stroke="#efffc0" stroke-width="12"/>
  </g>`,
  CF: `<g data-branded-artwork="true" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M145 165h78v48c0 27-17 44-39 44s-39-17-39-44z" fill="#efffc0" stroke="#c9ff3d" stroke-width="8"/>
    <path d="M223 177h14c24 0 24 37 0 37h-14" stroke="#c9ff3d" stroke-width="11"/>
    <path d="M165 145c-7-11 7-17 0-28M190 145c-7-11 7-17 0-28M214 145c-7-11 7-17 0-28" stroke="#efffc0" stroke-width="7"/>
  </g>`,
  BG: `<g data-branded-artwork="true" stroke-linecap="round" stroke-linejoin="round">
    <rect x="132" y="144" width="86" height="86" rx="20" fill="#c9ff3d" transform="rotate(-9 175 187)"/>
    <rect x="176" y="169" width="76" height="76" rx="18" fill="#efffc0" stroke="#10170b" stroke-width="7" transform="rotate(10 214 207)"/>
    <g fill="#10170b"><circle cx="154" cy="167" r="6"/><circle cx="194" cy="167" r="6"/><circle cx="174" cy="187" r="6"/><circle cx="154" cy="207" r="6"/><circle cx="194" cy="207" r="6"/><circle cx="197" cy="190" r="6"/><circle cx="231" cy="224" r="6"/></g>
  </g>`,
  LX: `<g data-branded-artwork="true" stroke-linecap="round" stroke-linejoin="round">
    <path d="M128 151h82a18 18 0 0 1 18 18v38a18 18 0 0 1-18 18h-29l-25 21v-21h-28a18 18 0 0 1-18-18v-38a18 18 0 0 1 18-18z" fill="#efffc0"/>
    <path d="M177 132h55a17 17 0 0 1 17 17v31a17 17 0 0 1-17 17h-12v18l-20-18h-23a17 17 0 0 1-17-17v-31a17 17 0 0 1 17-17z" fill="#c9ff3d" stroke="#10170b" stroke-width="7"/>
    <path d="M131 180h58M184 158h42" fill="none" stroke="#10170b" stroke-width="8"/>
  </g>`,
};

export const resolveEventArtworkCode = ({ icon = "", activity = "", title = "" }: EventArtworkInput) => {
  const haystack = ` ${normalize(`${activity} ${title}`)} `;
  const alias = aliasIndex.find(({ value }) => haystack.includes(` ${value} `));
  if (alias) return alias.code;

  const exact = eventArtworkRegistry.find((entry) => icon.includes(entry.emoji));
  return exact?.code || "EV";
};

export const buildEventArtworkSvg = (input: EventArtworkInput) => {
  const code = resolveEventArtworkCode(input);

  if (code === "EV") {
    return `<g data-event-artwork="EV" fill="none" stroke="#aeb3bd" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">
      <rect x="137" y="132" width="108" height="112" rx="22"/>
      <path d="M137 166h108M164 119v27M218 119v27M162 191h12M185 191h12M208 191h12M162 216h12M185 216h12"/>
    </g>`;
  }

  const branded = betaArtwork[code];
  if (branded) {
    return `<g data-event-artwork="${code}">${branded}</g>`;
  }

  const materialPath = materialEventArtworkPaths[code];
  return `<g data-event-artwork="${code}" transform="translate(143 143) scale(4)" fill="#c9ff3d">
    <path d="${materialPath}"/>
  </g>`;
};