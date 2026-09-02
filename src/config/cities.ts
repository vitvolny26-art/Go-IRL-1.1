import type { UiLanguage } from "../i18n";

export type City = {
  id: string;
  countryCode: string;
  name: Record<UiLanguage, string>;
  coordinates: { latitude: number; longitude: number };
  timezone: string;
  telegramCommunity?: {
    chatId: number;
    url: string;
    topicIds?: {
      chat: number;
      music: number;
      culture: number;
      sport: number;
      outdoor: number;
      education: number;
      games: number;
      kids: number;
    };
  };
};

// Add a city here to expose it across web, Telegram and future native clients.
export const cities: City[] = [
  {
    id: "olomouc",
    countryCode: "CZ",
    name: { ru: "Оломоуц", uk: "Оломоуц", cs: "Olomouc", en: "Olomouc", pl: "Ołomuniec", sk: "Olomouc" },
    coordinates: { latitude: 49.5938, longitude: 17.2509 },
    timezone: "Europe/Prague",
    telegramCommunity: {
      chatId: -1004451765209,
      url: "https://t.me/GoIRL_Olomouc",
      topicIds: {
        chat: 2,
        music: 3,
        culture: 4,
        sport: 5,
        outdoor: 6,
        education: 7,
        games: 8,
        kids: 9,
      },
    },
  },
  {
    id: "prerov",
    countryCode: "CZ",
    name: { ru: "Přerov", uk: "Přerov", cs: "Přerov", en: "Přerov", pl: "Přerov", sk: "Přerov" },
    coordinates: { latitude: 49.455, longitude: 17.4509 },
    timezone: "Europe/Prague",
  },
  {
    id: "praha",
    countryCode: "CZ",
    name: { ru: "Прага", uk: "Прага", cs: "Praha", en: "Prague", pl: "Praga", sk: "Praha" },
    coordinates: { latitude: 50.0755, longitude: 14.4378 },
    timezone: "Europe/Prague",
  },
  {
    id: "brno",
    countryCode: "CZ",
    name: { ru: "Брно", uk: "Брно", cs: "Brno", en: "Brno", pl: "Brno", sk: "Brno" },
    coordinates: { latitude: 49.1951, longitude: 16.6068 },
    timezone: "Europe/Prague",
  },
  {
    id: "bratislava",
    countryCode: "SK",
    name: { ru: "Братислава", uk: "Братислава", cs: "Bratislava", en: "Bratislava", pl: "Bratysława", sk: "Bratislava" },
    coordinates: { latitude: 48.1486, longitude: 17.1077 },
    timezone: "Europe/Bratislava",
  },
  {
    id: "krakow",
    countryCode: "PL",
    name: { ru: "Краков", uk: "Краків", cs: "Krakov", en: "Kraków", pl: "Kraków", sk: "Krakov" },
    coordinates: { latitude: 50.0647, longitude: 19.945 },
    timezone: "Europe/Warsaw",
  },
  {
    id: "kyiv",
    countryCode: "UA",
    name: { ru: "Киев", uk: "Київ", cs: "Kyjev", en: "Kyiv", pl: "Kijów", sk: "Kyjev" },
    coordinates: { latitude: 50.4501, longitude: 30.5234 },
    timezone: "Europe/Kyiv",
  },
  {
    id: "kharkiv",
    countryCode: "UA",
    name: { ru: "Харьков", uk: "Харків", cs: "Charkov", en: "Kharkiv", pl: "Charków", sk: "Charkov" },
    coordinates: { latitude: 49.9935, longitude: 36.2304 },
    timezone: "Europe/Kyiv",
    telegramCommunity: {
      chatId: -1003919911341,
      url: "https://t.me/GoIRL_Kharkiv",
    },
  },
  {
    id: "odesa",
    countryCode: "UA",
    name: { ru: "Одесса", uk: "Одеса", cs: "Oděsa", en: "Odesa", pl: "Odessa", sk: "Odesa" },
    coordinates: { latitude: 46.4825, longitude: 30.7233 },
    timezone: "Europe/Kyiv",
  },
  {
    id: "lviv",
    countryCode: "UA",
    name: { ru: "Львов", uk: "Львів", cs: "Lvov", en: "Lviv", pl: "Lwów", sk: "Ľvov" },
    coordinates: { latitude: 49.8397, longitude: 24.0297 },
    timezone: "Europe/Kyiv",
  },
];

export const defaultCityId = "olomouc";

export function getCity(cityId: string) {
  return cities.find((city) => city.id === cityId) ?? cities[0];
}
