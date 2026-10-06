import type {
  Activity,
  Language,
  MushroomPickingDifficulty,
  MushroomPickingEquipment,
  MushroomPickingExpertMode,
  MushroomPickingMetadata,
  MushroomPickingPartyPolicy,
  MushroomPickingTransportMode,
  MushroomPickingVerificationMode,
} from "./types";

const canonicalLabels = [
  "Идём за грибами",
  "Йдемо по гриби",
  "Jdeme na houby",
  "Mushroom picking",
  "Idziemy na grzyby",
  "Ideme na huby",
] as const;

const normalize = (value: string) => value
  .trim()
  .toLocaleLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/^[^\p{L}\p{N}]+/u, "")
  .trim();

const canonicalLabelSet = new Set(canonicalLabels.map(normalize));

export const isMushroomPickingLabel = (value: string) => canonicalLabelSet.has(normalize(value));

export const isMushroomPickingActivity = (activity: Activity) =>
  activity.categoryId === "nature"
  && [...Object.values(activity.activity), ...Object.values(activity.title)].some(isMushroomPickingLabel);

export const defaultMushroomPickingMetadata: MushroomPickingMetadata = {
  expertMode: "recommended",
  transportMode: "meet_on_site",
  verificationMode: "recommended",
  difficulty: "moderate",
  durationMinutes: 180,
  equipment: ["basket", "boots", "rain_protection", "tick_protection"],
  childrenPolicy: "not_specified",
  petsPolicy: "not_specified",
};

const expertModes = ["none", "recommended", "required"] as const;
const transportModes = ["meet_on_site", "carpool", "driver_needed"] as const;
const verificationModes = ["none", "recommended", "planned"] as const;
const difficulties = ["easy", "moderate", "demanding"] as const;
const partyPolicies = ["not_specified", "welcome", "not_recommended"] as const;
const equipmentOptions = ["basket", "knife", "boots", "rain_protection", "tick_protection"] as const;
const durationOptions = [120, 180, 240, 300] as const;

const enumValue = <T extends string>(
  value: FormDataEntryValue | null,
  allowed: readonly T[],
  fallback: T,
) => {
  const text = String(value || "") as T;
  return allowed.includes(text) ? text : fallback;
};

export const mushroomPickingMetadataFromForm = (data: FormData): MushroomPickingMetadata => {
  const duration = Number(data.get("mushroomDuration"));
  const equipment = data.getAll("mushroomEquipment")
    .map(String)
    .filter((value): value is MushroomPickingEquipment =>
      equipmentOptions.includes(value as MushroomPickingEquipment));

  return {
    expertMode: enumValue<MushroomPickingExpertMode>(
      data.get("mushroomExpertMode"),
      expertModes,
      defaultMushroomPickingMetadata.expertMode,
    ),
    transportMode: enumValue<MushroomPickingTransportMode>(
      data.get("mushroomTransportMode"),
      transportModes,
      defaultMushroomPickingMetadata.transportMode,
    ),
    verificationMode: enumValue<MushroomPickingVerificationMode>(
      data.get("mushroomVerificationMode"),
      verificationModes,
      defaultMushroomPickingMetadata.verificationMode,
    ),
    difficulty: enumValue<MushroomPickingDifficulty>(
      data.get("mushroomDifficulty"),
      difficulties,
      defaultMushroomPickingMetadata.difficulty,
    ),
    durationMinutes: durationOptions.includes(duration as (typeof durationOptions)[number])
      ? duration
      : defaultMushroomPickingMetadata.durationMinutes,
    equipment,
    childrenPolicy: enumValue<MushroomPickingPartyPolicy>(
      data.get("mushroomChildrenPolicy"),
      partyPolicies,
      defaultMushroomPickingMetadata.childrenPolicy,
    ),
    petsPolicy: enumValue<MushroomPickingPartyPolicy>(
      data.get("mushroomPetsPolicy"),
      partyPolicies,
      defaultMushroomPickingMetadata.petsPolicy,
    ),
  };
};

type Copy = {
  panelTitle: string;
  duration: string;
  difficulty: string;
  expert: string;
  transport: string;
  verification: string;
  equipment: string;
  children: string;
  pets: string;
  minutes: string;
  difficultyValues: Record<MushroomPickingDifficulty, string>;
  expertValues: Record<MushroomPickingExpertMode, string>;
  transportValues: Record<MushroomPickingTransportMode, string>;
  verificationValues: Record<MushroomPickingVerificationMode, string>;
  partyValues: Record<MushroomPickingPartyPolicy, string>;
  equipmentValues: Record<MushroomPickingEquipment, string>;
};

const copyByLanguage: Record<Language, Copy> = {
  ru: {
    panelTitle: "Параметры сбора грибов", duration: "Продолжительность", difficulty: "Сложность",
    expert: "Опытный грибник / эксперт", transport: "Как добираемся", verification: "Проверка собранных грибов",
    equipment: "Что взять", children: "Дети", pets: "Питомцы", minutes: "мин",
    difficultyValues: { easy: "Легко", moderate: "Средняя", demanding: "Сложно" },
    expertValues: { none: "Не нужен", recommended: "Желателен", required: "Обязателен" },
    transportValues: { meet_on_site: "Встречаемся на месте", carpool: "Карпулинг", driver_needed: "Нужен водитель" },
    verificationValues: { none: "Не планируется", recommended: "Рекомендуется", planned: "Запланирована" },
    partyValues: { not_specified: "Не указано", welcome: "Можно", not_recommended: "Не рекомендуется" },
    equipmentValues: { basket: "Корзина", knife: "Нож для грибов", boots: "Ботинки", rain_protection: "Защита от дождя", tick_protection: "Защита от клещей" },
  },
  uk: {
    panelTitle: "Параметри збирання грибів", duration: "Тривалість", difficulty: "Складність",
    expert: "Досвідчений грибник / експерт", transport: "Як добираємося", verification: "Перевірка зібраних грибів",
    equipment: "Що взяти", children: "Діти", pets: "Тварини", minutes: "хв",
    difficultyValues: { easy: "Легко", moderate: "Середня", demanding: "Складно" },
    expertValues: { none: "Не потрібен", recommended: "Бажаний", required: "Обов'язковий" },
    transportValues: { meet_on_site: "Зустрічаємося на місці", carpool: "Карпулінг", driver_needed: "Потрібен водій" },
    verificationValues: { none: "Не планується", recommended: "Рекомендується", planned: "Запланована" },
    partyValues: { not_specified: "Не вказано", welcome: "Можна", not_recommended: "Не рекомендується" },
    equipmentValues: { basket: "Кошик", knife: "Ніж для грибів", boots: "Черевики", rain_protection: "Захист від дощу", tick_protection: "Захист від кліщів" },
  },
  cs: {
    panelTitle: "Parametry houbaření", duration: "Délka", difficulty: "Náročnost",
    expert: "Zkušený houbař / znalec", transport: "Doprava", verification: "Kontrola nasbíraných hub",
    equipment: "Co vzít s sebou", children: "Děti", pets: "Zvířata", minutes: "min",
    difficultyValues: { easy: "Lehká", moderate: "Střední", demanding: "Náročná" },
    expertValues: { none: "Není potřeba", recommended: "Doporučen", required: "Povinný" },
    transportValues: { meet_on_site: "Sraz na místě", carpool: "Spolujízda", driver_needed: "Potřebujeme řidiče" },
    verificationValues: { none: "Neplánuje se", recommended: "Doporučena", planned: "Naplánována" },
    partyValues: { not_specified: "Neuvedeno", welcome: "Ano", not_recommended: "Nedoporučeno" },
    equipmentValues: { basket: "Košík", knife: "Houbařský nůž", boots: "Boty", rain_protection: "Ochrana proti dešti", tick_protection: "Ochrana proti klíšťatům" },
  },
  en: {
    panelTitle: "Mushroom picking details", duration: "Duration", difficulty: "Difficulty",
    expert: "Experienced mushroom picker / expert", transport: "Transport", verification: "Mushroom check after picking",
    equipment: "What to bring", children: "Children", pets: "Pets", minutes: "min",
    difficultyValues: { easy: "Easy", moderate: "Moderate", demanding: "Demanding" },
    expertValues: { none: "Not needed", recommended: "Recommended", required: "Required" },
    transportValues: { meet_on_site: "Meet on site", carpool: "Carpool", driver_needed: "Driver needed" },
    verificationValues: { none: "Not planned", recommended: "Recommended", planned: "Planned" },
    partyValues: { not_specified: "Not specified", welcome: "Welcome", not_recommended: "Not recommended" },
    equipmentValues: { basket: "Basket", knife: "Mushroom knife", boots: "Boots", rain_protection: "Rain protection", tick_protection: "Tick protection" },
  },
  pl: {
    panelTitle: "Parametry grzybobrania", duration: "Czas trwania", difficulty: "Trudność",
    expert: "Doświadczony grzybiarz / ekspert", transport: "Transport", verification: "Sprawdzenie zebranych grzybów",
    equipment: "Co zabrać", children: "Dzieci", pets: "Zwierzęta", minutes: "min",
    difficultyValues: { easy: "Łatwe", moderate: "Średnie", demanding: "Wymagające" },
    expertValues: { none: "Niepotrzebny", recommended: "Zalecany", required: "Wymagany" },
    transportValues: { meet_on_site: "Spotkanie na miejscu", carpool: "Wspólny przejazd", driver_needed: "Potrzebny kierowca" },
    verificationValues: { none: "Nieplanowane", recommended: "Zalecane", planned: "Zaplanowane" },
    partyValues: { not_specified: "Nie określono", welcome: "Tak", not_recommended: "Niezalecane" },
    equipmentValues: { basket: "Koszyk", knife: "Nóż do grzybów", boots: "Buty", rain_protection: "Ochrona przed deszczem", tick_protection: "Ochrona przed kleszczami" },
  },
  sk: {
    panelTitle: "Parametre hubárčenia", duration: "Trvanie", difficulty: "Náročnosť",
    expert: "Skúsený hubár / odborník", transport: "Doprava", verification: "Kontrola nazbieraných húb",
    equipment: "Čo si vziať", children: "Deti", pets: "Zvieratá", minutes: "min",
    difficultyValues: { easy: "Ľahká", moderate: "Stredná", demanding: "Náročná" },
    expertValues: { none: "Nie je potrebný", recommended: "Odporúčaný", required: "Povinný" },
    transportValues: { meet_on_site: "Stretnutie na mieste", carpool: "Spolujazda", driver_needed: "Potrebujeme vodiča" },
    verificationValues: { none: "Neplánuje sa", recommended: "Odporúčaná", planned: "Naplánovaná" },
    partyValues: { not_specified: "Neuvedené", welcome: "Áno", not_recommended: "Neodporúča sa" },
    equipmentValues: { basket: "Košík", knife: "Hubársky nôž", boots: "Topánky", rain_protection: "Ochrana pred dažďom", tick_protection: "Ochrana pred kliešťami" },
  },
};

export function MushroomPickingCreateFields({ language, initial = {} }: {
  language: Language;
  initial?: Partial<MushroomPickingMetadata>;
}) {
  const copy = copyByLanguage[language];
  const values = { ...defaultMushroomPickingMetadata, ...initial };
  const selectedEquipment = new Set(initial.equipment || defaultMushroomPickingMetadata.equipment);

  return (
    <div className="sport-create-panel" data-activity-extension="mushroom-picking">
      <div className="sport-panel-title">{copy.panelTitle}</div>
      <div className="form-row">
        <label><span>{copy.duration}</span><select name="mushroomDuration" defaultValue={String(values.durationMinutes)}>
          {durationOptions.map((minutes) => <option key={minutes} value={minutes}>{minutes} {copy.minutes}</option>)}
        </select></label>
        <label><span>{copy.difficulty}</span><select name="mushroomDifficulty" defaultValue={values.difficulty}>
          {difficulties.map((value) => <option key={value} value={value}>{copy.difficultyValues[value]}</option>)}
        </select></label>
      </div>
      <div className="form-row">
        <label><span>{copy.expert}</span><select name="mushroomExpertMode" defaultValue={values.expertMode}>
          {expertModes.map((value) => <option key={value} value={value}>{copy.expertValues[value]}</option>)}
        </select></label>
        <label><span>{copy.transport}</span><select name="mushroomTransportMode" defaultValue={values.transportMode}>
          {transportModes.map((value) => <option key={value} value={value}>{copy.transportValues[value]}</option>)}
        </select></label>
      </div>
      <label><span>{copy.verification}</span><select name="mushroomVerificationMode" defaultValue={values.verificationMode}>
        {verificationModes.map((value) => <option key={value} value={value}>{copy.verificationValues[value]}</option>)}
      </select></label>
      <fieldset>
        <legend>{copy.equipment}</legend>
        <div className="segmented">
          {equipmentOptions.map((value) => <label key={value}>
            <input name="mushroomEquipment" type="checkbox" value={value} defaultChecked={selectedEquipment.has(value)} />
            <span>{copy.equipmentValues[value]}</span>
          </label>)}
        </div>
      </fieldset>
      <div className="form-row">
        <label><span>{copy.children}</span><select name="mushroomChildrenPolicy" defaultValue={values.childrenPolicy}>
          {partyPolicies.map((value) => <option key={value} value={value}>{copy.partyValues[value]}</option>)}
        </select></label>
        <label><span>{copy.pets}</span><select name="mushroomPetsPolicy" defaultValue={values.petsPolicy}>
          {partyPolicies.map((value) => <option key={value} value={value}>{copy.partyValues[value]}</option>)}
        </select></label>
      </div>
    </div>
  );
}

export type MushroomPickingDetailRow = { id: string; label: string; value: string };

export const mushroomPickingDetailRows = (activity: Activity, language: Language): MushroomPickingDetailRow[] => {
  const metadata = activity.metadata?.mushroomPicking;
  if (!metadata && !isMushroomPickingActivity(activity)) return [];
  const values = { ...defaultMushroomPickingMetadata, ...(metadata || {}) };
  const copy = copyByLanguage[language];
  const equipment = values.equipment.map((value) => copy.equipmentValues[value]).join(", ");

  return [
    { id: "mushroom-duration", label: copy.duration, value: `${values.durationMinutes} ${copy.minutes}` },
    { id: "mushroom-difficulty", label: copy.difficulty, value: copy.difficultyValues[values.difficulty] },
    { id: "mushroom-expert", label: copy.expert, value: copy.expertValues[values.expertMode] },
    { id: "mushroom-transport", label: copy.transport, value: copy.transportValues[values.transportMode] },
    { id: "mushroom-verification", label: copy.verification, value: copy.verificationValues[values.verificationMode] },
    ...(equipment ? [{ id: "mushroom-equipment", label: copy.equipment, value: equipment }] : []),
    { id: "mushroom-children", label: copy.children, value: copy.partyValues[values.childrenPolicy] },
    { id: "mushroom-pets", label: copy.pets, value: copy.partyValues[values.petsPolicy] },
  ];
};

export type MushroomPickingPostEventQuestion = {
  id: "expert_guidance_provided" | "mushroom_check_provided" | "transport_fulfilled";
  respondent: "confirmed_participant";
  effect: "future_role_feedback" | "activity_quality";
};

export const mushroomPickingPostEventQuestions = (
  metadata: MushroomPickingMetadata = defaultMushroomPickingMetadata,
): MushroomPickingPostEventQuestion[] => [
  ...(metadata.expertMode !== "none"
    ? [{ id: "expert_guidance_provided", respondent: "confirmed_participant", effect: "future_role_feedback" } as const]
    : []),
  ...(metadata.verificationMode !== "none"
    ? [{ id: "mushroom_check_provided", respondent: "confirmed_participant", effect: "activity_quality" } as const]
    : []),
  ...(metadata.transportMode !== "meet_on_site"
    ? [{ id: "transport_fulfilled", respondent: "confirmed_participant", effect: "future_role_feedback" } as const]
    : []),
];

export const mushroomPickingPostEventContract = {
  engine: "existing_postevent",
  reuses: ["event_resolution", "attendance", "organizer_rating", "rating_tags", "safety"],
  activitySpecificAnswersNeedDurableExtension: true,
  roleReputationOwner: "Activ018",
} as const;
