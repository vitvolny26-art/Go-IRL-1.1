import type { Activity, ActivityMetadata, Language } from "./types";

const localized = (ru: string, uk: string, cs: string, en: string): Record<Language, string> => ({ ru, uk, cs, en });

const baseActivity = (
  id: string,
  type: Activity["type"],
  categoryId: string,
  activity: Record<Language, string>,
  title: Record<Language, string>,
  description: Record<Language, string>,
  metadata: ActivityMetadata,
  time: string,
): Activity => ({
  id,
  type,
  categoryId,
  activity,
  title,
  description,
  date: "2026-09-12",
  time,
  cityId: "olomouc",
  address: "Smetanovy sady, Olomouc",
  locationUrl: "",
  participantNote: "",
  price: 0,
  capacity: 200,
  participants: 0,
  members: [],
  organizer: "GO IRL Demo",
  organizerKey: "demo:cezfest",
  visibility: "public",
  metadata,
});

const rootId = "demo-cezfest-2026";
const sportId = "demo-cezfest-sport";
const cultureId = "demo-cezfest-culture";

export const cezfestHierarchyDemo: Activity[] = [
  baseActivity(
    rootId,
    "custom",
    "activities",
    localized("🎪 Фестиваль", "🎪 Фестиваль", "🎪 Festival", "🎪 Festival"),
    localized("ČEZFEST 2026", "ČEZFEST 2026", "ČEZFEST 2026", "ČEZFEST 2026"),
    localized("Фестиваль с отдельными спортивной и культурной программами.", "Фестиваль з окремими спортивною та культурною програмами.", "Festival se samostatným sportovním a kulturním programem.", "Festival with separate sport and culture programs."),
    { hierarchy: { level: "root", rootActivityId: rootId } },
    "10:00",
  ),
  baseActivity(
    sportId,
    "sport",
    "sport",
    localized("🏆 Спорт", "🏆 Спорт", "🏆 Sport", "🏆 Sport"),
    localized("ČEZFEST — Sport", "ČEZFEST — Sport", "ČEZFEST — Sport", "ČEZFEST — Sport"),
    localized("Спортивная программа фестиваля.", "Спортивна програма фестивалю.", "Sportovní program festivalu.", "Festival sport program."),
    { hierarchy: { level: "category", parentActivityId: rootId, rootActivityId: rootId, groupCategory: "sport" } },
    "10:00",
  ),
  baseActivity(
    cultureId,
    "culture",
    "activities",
    localized("🎭 Культура", "🎭 Культура", "🎭 Kultura", "🎭 Culture"),
    localized("ČEZFEST — Culture", "ČEZFEST — Culture", "ČEZFEST — Culture", "ČEZFEST — Culture"),
    localized("Культурная программа фестиваля.", "Культурна програма фестивалю.", "Kulturní program festivalu.", "Festival culture program."),
    { hierarchy: { level: "category", parentActivityId: rootId, rootActivityId: rootId, groupCategory: "culture" } },
    "10:00",
  ),
  ...[
    ["running", "🏃 Running", "Running", "11:00"],
    ["floorball-u15", "🏑 Floorball U15", "Floorball", "12:00"],
    ["parkour", "🤸 Parkour", "Parkour", "13:00"],
    ["floorball-15plus", "🏑 Floorball 15+", "Floorball", "14:00"],
    ["sports-talk", "🎤 Sports Talk", "Sports Talk", "16:00"],
  ].map(([slug, label, sportType, time]) =>
    baseActivity(
      `demo-cezfest-${slug}`,
      "sport",
      "sport",
      localized(label, label, label, label),
      localized(`ČEZFEST — ${label}`, `ČEZFEST — ${label}`, `ČEZFEST — ${label}`, `ČEZFEST — ${label}`),
      localized("Конкретное спортивное событие фестиваля.", "Конкретна спортивна подія фестивалю.", "Konkrétní sportovní událost festivalu.", "A concrete festival sport event."),
      {
        hierarchy: { level: "event", parentActivityId: sportId, rootActivityId: rootId, groupCategory: "sport" },
        sport: { sportType, format: "casual", environment: "outdoor", durationMinutes: 60 },
      },
      time,
    ),
  ),
];
