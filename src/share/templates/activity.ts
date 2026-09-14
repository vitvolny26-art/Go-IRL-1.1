import type { ActivityShareKind, ShareLanguageMap, ShareModel } from "../types";

const lowerFirst = (value: string) => value.charAt(0).toLocaleLowerCase() + value.slice(1);

export const activitySentence: ShareLanguageMap<Record<ActivityShareKind, (data: ShareModel) => string>> = {
  ru: {
    volleyball: ({ weekday }) => `В ${weekday} собираемся поиграть в волейбол.`,
    "inline-skating": ({ weekday }) => `В ${weekday} едем кататься на роликах.`,
    coffee: ({ weekday }) => `В ${weekday} собираемся выпить кофе.`,
    hiking: ({ weekday }) => `В ${weekday} идём в небольшой поход.`,
    cycling: ({ weekday }) => `В ${weekday} едем кататься на велосипедах.`,
    "board-games": ({ weekday }) => `В ${weekday} собираемся поиграть в настольные игры.`,
    tennis: ({ weekday }) => `В ${weekday} играем в теннис.`,
    running: ({ weekday }) => `В ${weekday} идём на совместную пробежку.`,
    generic: ({ weekday, activity }) => `В ${weekday} собираемся поиграть в ${lowerFirst(activity)}.`,
  },
  uk: {
    volleyball: ({ weekday }) => `У ${weekday} збираємося пограти у волейбол.`,
    "inline-skating": ({ weekday }) => `У ${weekday} їдемо кататися на роликах.`,
    coffee: ({ weekday }) => `У ${weekday} збираємося випити кави.`,
    hiking: ({ weekday }) => `У ${weekday} йдемо в невеликий похід.`,
    cycling: ({ weekday }) => `У ${weekday} їдемо кататися на велосипедах.`,
    "board-games": ({ weekday }) => `У ${weekday} збираємося пограти в настільні ігри.`,
    tennis: ({ weekday }) => `У ${weekday} граємо в теніс.`,
    running: ({ weekday }) => `У ${weekday} йдемо на спільну пробіжку.`,
    generic: ({ weekday, activity }) => `У ${weekday} збираємося на ${lowerFirst(activity)}.`,
  },
  cs: {
    volleyball: ({ weekday }) => `V ${weekday} si jdeme zahrát volejbal.`,
    "inline-skating": ({ weekday }) => `V ${weekday} jdeme jezdit na inline bruslích.`,
    coffee: ({ weekday }) => `V ${weekday} jdeme na kávu.`,
    hiking: ({ weekday }) => `V ${weekday} jdeme na menší výlet.`,
    cycling: ({ weekday }) => `V ${weekday} jedeme se projet na kole.`,
    "board-games": ({ weekday }) => `V ${weekday} si jdeme zahrát deskové hry.`,
    tennis: ({ weekday }) => `V ${weekday} hrajeme tenis.`,
    running: ({ weekday }) => `V ${weekday} si jdeme společně zaběhat.`,
    generic: ({ weekday, activity }) => `V ${weekday} se scházíme na ${lowerFirst(activity)}.`,
  },
  en: {
    volleyball: ({ weekday }) => `On ${weekday}, we're getting together for volleyball.`,
    "inline-skating": ({ weekday }) => `On ${weekday}, we're going inline skating.`,
    coffee: ({ weekday }) => `On ${weekday}, we're getting coffee.`,
    hiking: ({ weekday }) => `On ${weekday}, we're going on a short hike.`,
    cycling: ({ weekday }) => `On ${weekday}, we're going cycling.`,
    "board-games": ({ weekday }) => `On ${weekday}, we're playing board games.`,
    tennis: ({ weekday }) => `On ${weekday}, we're playing tennis.`,
    running: ({ weekday }) => `On ${weekday}, we're going for a run together.`,
    generic: ({ weekday, activity }) => `On ${weekday}, we're getting together for ${lowerFirst(activity)}.`,
  },
  pl: {
    volleyball: ({ weekday }) => `On ${weekday}, we're getting together for volleyball.`,
    "inline-skating": ({ weekday }) => `On ${weekday}, we're going inline skating.`,
    coffee: ({ weekday }) => `On ${weekday}, we're getting coffee.`,
    hiking: ({ weekday }) => `On ${weekday}, we're going on a short hike.`,
    cycling: ({ weekday }) => `On ${weekday}, we're going cycling.`,
    "board-games": ({ weekday }) => `On ${weekday}, we're playing board games.`,
    tennis: ({ weekday }) => `On ${weekday}, we're playing tennis.`,
    running: ({ weekday }) => `On ${weekday}, we're going for a run together.`,
    generic: ({ weekday, activity }) => `On ${weekday}, we're getting together for ${lowerFirst(activity)}.`,
  },
  sk: {
    volleyball: ({ weekday }) => `V ${weekday} si jdeme zahrát volejbal.`,
    "inline-skating": ({ weekday }) => `V ${weekday} jdeme jezdit na inline bruslích.`,
    coffee: ({ weekday }) => `V ${weekday} jdeme na kávu.`,
    hiking: ({ weekday }) => `V ${weekday} jdeme na menší výlet.`,
    cycling: ({ weekday }) => `V ${weekday} jedeme se projet na kole.`,
    "board-games": ({ weekday }) => `V ${weekday} si jdeme zahrát deskové hry.`,
    tennis: ({ weekday }) => `V ${weekday} hrajeme tenis.`,
    running: ({ weekday }) => `V ${weekday} si jdeme společně zaběhat.`,
    generic: ({ weekday, activity }) => `V ${weekday} se scházíme na ${lowerFirst(activity)}.`,
  },
};

export const activityKindTerms: Record<Exclude<ActivityShareKind, "generic">, string[]> = {
  volleyball: ["волейбол", "volejbal", "volleyball", "🏐"],
  "inline-skating": ["ролик", "inline", "brusl", "skating", "🛼"],
  coffee: ["кофе", "кава", "káva", "coffee", "☕"],
  hiking: ["поход", "похід", "výlet", "hike", "hiking", "🥾"],
  cycling: ["велосипед", "велосипед", "kolo", "cycling", "bike", "🚴"],
  "board-games": ["настол", "настіль", "deskov", "board", "🎲"],
  tennis: ["теннис", "теніс", "tenis", "tennis", "🎾"],
  running: ["бег", "біг", "běh", "running", "run", "🏃"],
};

