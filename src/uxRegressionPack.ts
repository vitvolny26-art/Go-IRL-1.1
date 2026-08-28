import { stripLeadingEmoji } from "./cardText";
import { getTranslation } from "./i18n";
import { useAppStore } from "./store";
import type { Activity, Language, SportEnvironment } from "./types";
import { sportEnvironmentLabel } from "./verticals/sport";

const languageByShortLabel: Record<string, Language> = {
  RU: "ru",
  UK: "uk",
  CS: "cs",
  EN: "en",
};

const runtimeCopy = (language: Language) => {
  const translation = getTranslation(language);
  return {
    tagline: translation.tagline,
    meaning: translation.brandMeaning,
    participants: translation.participants,
    indoor: sportEnvironmentLabel("indoor", language),
  };
};

const indoorDefaultTerms = [
  "gym",
  "fitness",
  "table tennis",
  "yoga",
  "тренажерный зал",
  "тренажёрный зал",
  "настольный теннис",
  "йога",
  "тренажерний зал",
  "настільний теніс",
  "posilovna",
  "stolní tenis",
  "joga",
  "jóga",
];

const normalizeText = (value: string | null | undefined) =>
  String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const resolveBrandCopy = (language: Language) => runtimeCopy(language);

export const isIndoorDefaultSportLabel = (value: string | null | undefined) => {
  const normalized = normalizeText(stripLeadingEmoji(String(value || "")));
  return indoorDefaultTerms.some((term) => normalized.includes(normalizeText(term)));
};

const isDefaultedTestActivity = (activity: Activity) => {
  const titleValues = Object.values(activity.title || {});
  return activity.organizer === "GO IRL Demo"
    || titleValues.some((value) => /^\s*\[(?:test|тест)\]/iu.test(String(value || "")));
};

export const resolveEffectiveSportEnvironment = (activity: Activity): SportEnvironment | undefined => {
  const meta = activity.metadata?.sport;
  const labels = [
    meta?.sportType,
    ...Object.values(activity.activity || {}),
    ...Object.values(activity.title || {}),
  ];
  const indoorByDefault = labels.some(isIndoorDefaultSportLabel);

  if (meta?.environment === "indoor") return "indoor";
  if (!meta?.environment && indoorByDefault) return "indoor";
  if (meta?.environment === "outdoor" && indoorByDefault && isDefaultedTestActivity(activity)) return "indoor";
  return meta?.environment;
};

const currentLanguage = (): Language => {
  const visibleCode = document.querySelector<HTMLElement>(".language-control span")?.textContent?.trim().toUpperCase();
  if (visibleCode && languageByShortLabel[visibleCode]) return languageByShortLabel[visibleCode];

  try {
    const stored = JSON.parse(localStorage.getItem("go-irl-user-preferences") || "null") as { language?: Language } | null;
    if (stored?.language && ["ru", "uk", "cs", "en"].includes(stored.language)) return stored.language;
  } catch {
    // Ignore malformed legacy preferences and use the stable default.
  }

  return "en";
};

const activityLabel = (activity: Activity, language: Language) =>
  normalizeText(stripLeadingEmoji(activity.activity[language] || activity.activity.en || activity.activity.ru || ""));

const activityTitle = (activity: Activity, language: Language) =>
  normalizeText(stripLeadingEmoji(activity.title[language] || activity.title.en || activity.title.ru || ""));

export const resolveSportCardActivity = (activities: Activity[], activityId: string | null | undefined, heading: string | null | undefined, subtitle: string | null | undefined, language: Language) => {
  const candidates = activities.filter((activity) => activity.type === "sport" || activity.categoryId === "sport");
  if (activityId) {
    const exact = candidates.find((activity) => activity.id === activityId);
    if (exact) return exact;
  }
  const normalizedHeading = normalizeText(heading);
  const normalizedSubtitle = normalizeText(subtitle);
  return candidates.find((activity) =>
    activityLabel(activity, language) === normalizedHeading && activityTitle(activity, language) === normalizedSubtitle)
    || candidates.find((activity) => activityLabel(activity, language) === normalizedHeading)
    || null;
};

const matchSportCardActivity = (card: HTMLElement, language: Language) => {
  const activityId = card.querySelector<HTMLElement>(".card-reminder-action[data-activity-id]")?.dataset.activityId?.trim() || null;
  return resolveSportCardActivity(
    useAppStore.getState().activities,
    activityId,
    card.querySelector("h3")?.textContent,
    card.querySelector(".sport-card-main p")?.textContent,
    language,
  );
};

type ChipIcon = "level" | "environment" | "duration" | "participants";

const chipIconPaths: Record<ChipIcon, string[]> = {
  level: ["M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z", "m9 12 2 2 4-4"],
  environment: ["M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0", "M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6"],
  duration: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20", "M12 6v6l4 2"],
  participants: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8", "M22 21v-2a4 4 0 0 0-3-3.87", "M16 3.13a4 4 0 0 1 0 7.75"],
};

const createChipIcon = (icon: ChipIcon) => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("runtime-chip-icon");
  chipIconPaths[icon].forEach((pathData) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathData);
    svg.append(path);
  });
  return svg;
};

const setChipContent = (chip: HTMLElement, icon: ChipIcon, label: string) => {
  const currentLabel = chip.querySelector<HTMLElement>(".runtime-chip-label");
  if (chip.dataset.runtimeChipIcon === icon && currentLabel?.textContent === label) return;
  const text = document.createElement("span");
  text.className = "runtime-chip-label";
  text.textContent = label;
  chip.replaceChildren(createChipIcon(icon), text);
  chip.dataset.runtimeChipIcon = icon;
};

const openMembersFromCard = (card: HTMLElement) => {
  card.querySelector<HTMLButtonElement>(".sport-card-main")?.click();
  window.setTimeout(() => {
    const toggle = document.querySelector<HTMLButtonElement>(".sport-sheet .detail-members-toggle");
    if (!toggle) return;
    if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
    toggle.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 80);
};

const ensureParticipantsChip = (card: HTMLElement, activity: Activity, language: Language) => {
  const row = card.querySelector<HTMLElement>(".sport-chip-row");
  if (!row) return;

  let chip = row.querySelector<HTMLButtonElement>(".runtime-participants-chip");
  if (!chip) {
    chip = document.createElement("button");
    chip.type = "button";
    chip.className = "sport-card-chip sport-card-participants-chip runtime-participants-chip";
    chip.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMembersFromCard(card);
    });
    row.append(chip);
  }

  const label = `${runtimeCopy(language).participants}: ${activity.participants} / ${activity.capacity}`;
  const text = `${activity.participants}/${activity.capacity}`;
  if (chip.getAttribute("aria-label") !== label) chip.setAttribute("aria-label", label);
  setChipContent(chip, "participants", text);
};

const applyCardEnvironment = (card: HTMLElement, activity: Activity, language: Language) => {
  const environment = resolveEffectiveSportEnvironment(activity);
  const indoor = environment === "indoor";
  card.toggleAttribute("data-runtime-indoor", indoor);

  const environmentChip = card.querySelector<HTMLElement>(".sport-environment-chip");
  if (!environment) {
    if (environmentChip) environmentChip.hidden = true;
    return;
  }
  if (environmentChip) environmentChip.hidden = false;

  const environmentText = indoor ? runtimeCopy(language).indoor : sportEnvironmentLabel(environment, language);
  if (environmentChip) setChipContent(environmentChip, "environment", environmentText);
  if (!indoor) return;

  const weather = card.querySelector<HTMLElement>(".event-card-weather");
  if (weather && !weather.hidden) weather.hidden = true;
};

const decorateSportCardChips = (card: HTMLElement) => {
  const level = card.querySelector<HTMLElement>(".sport-level-chip");
  const duration = card.querySelector<HTMLElement>(".sport-duration-chip");
  if (level) {
    const label = level.querySelector<HTMLElement>(".runtime-chip-label")?.textContent || level.textContent?.trim() || "";
    if (label) setChipContent(level, "level", label);
  }
  if (duration) {
    const label = duration.querySelector<HTMLElement>(".runtime-chip-label")?.textContent || duration.textContent?.trim() || "";
    if (label) setChipContent(duration, "duration", label);
  }
};

const applySportCards = (language: Language) => {
  document.querySelectorAll<HTMLElement>(".compact-sport-card").forEach((card) => {
    card.querySelector<HTMLElement>(".card-share-action > .event-chat-unread-alert")?.remove();
    const activity = matchSportCardActivity(card, language);
    if (!activity) return;
    ensureParticipantsChip(card, activity, language);
    applyCardEnvironment(card, activity, language);
    decorateSportCardChips(card);
  });
};

const matchOpenSheetActivity = (language: Language) => {
  const heading = normalizeText(document.querySelector(".sport-sheet h2")?.textContent);
  if (!heading) return null;
  return useAppStore.getState().activities.find((activity) =>
    (activity.type === "sport" || activity.categoryId === "sport")
    && activityTitle(activity, language) === heading) || null;
};

const applyOpenSheetEnvironment = (language: Language) => {
  const sheet = document.querySelector<HTMLElement>(".sport-sheet");
  if (!sheet) return;
  const activity = matchOpenSheetActivity(language);
  if (!activity || resolveEffectiveSportEnvironment(activity) !== "indoor") return;

  const copy = runtimeCopy(language).indoor;
  const eyebrow = sheet.querySelector<HTMLElement>(".sport-eyebrow");
  if (eyebrow && eyebrow.textContent !== copy) eyebrow.textContent = copy;
  const environmentChip = sheet.querySelector<HTMLElement>(".sport-sheet-chips > span:nth-child(3)");
  if (environmentChip && environmentChip.textContent !== copy) environmentChip.textContent = copy;
  sheet.querySelectorAll<HTMLElement>(".weather-summary-toggle, .weather-detail-card").forEach((node) => {
    if (!node.hidden) node.hidden = true;
  });
};

const ensureLocalizedHero = (language: Language) => {
  const frame = document.querySelector<HTMLElement>(".go-irl-hero-logo-frame");
  if (!frame) return;

  let brand = frame.querySelector<HTMLElement>(".runtime-hero-brand");
  if (!brand) {
    brand = document.createElement("div");
    brand.className = "runtime-hero-brand";

    const logo = document.createElement("img");
    logo.src = "/branding/go-irl-logo.jpg";
    logo.alt = "";
    logo.className = "runtime-hero-brand-mark";

    const copy = document.createElement("span");
    copy.className = "runtime-hero-brand-copy";
    copy.innerHTML = "<strong>GO IRL</strong><span></span><small></small>";

    brand.append(logo, copy);
    frame.append(brand);
  }

  const copy = runtimeCopy(language);
  const tagline = brand.querySelector<HTMLElement>(".runtime-hero-brand-copy > span");
  const meaning = brand.querySelector<HTMLElement>(".runtime-hero-brand-copy > small");
  if (tagline && tagline.textContent !== copy.tagline) tagline.textContent = copy.tagline;
  if (meaning && meaning.textContent !== copy.meaning) meaning.textContent = copy.meaning;
  if (frame.dataset.language !== language) frame.dataset.language = language;
};

const hideHomeEventSections = () => {
  const grid = document.querySelector<HTMLElement>(".category-grid.module-grid");
  if (!grid) return;

  let sibling = grid.nextElementSibling as HTMLElement | null;
  while (sibling) {
    if (!sibling.hidden) sibling.hidden = true;
    if (sibling.dataset.homeEventSectionHidden !== "true") sibling.dataset.homeEventSectionHidden = "true";
    sibling = sibling.nextElementSibling as HTMLElement | null;
  }
};

const applyFormEnvironmentDefault = () => {
  document.querySelectorAll<HTMLFormElement>("form").forEach((form) => {
    const activity = form.querySelector<HTMLSelectElement>('select[name="activityText"]');
    const environment = form.querySelector<HTMLSelectElement>('select[name="sportEnvironment"]');
    if (!activity || !environment || environment.dataset.environmentTouched === "true") return;
    if (activity.dataset.activityChanged === "true" && isIndoorDefaultSportLabel(activity.value)) {
      environment.value = "indoor";
    }
  });
};

const applyAll = () => {
  const language = currentLanguage();
  ensureLocalizedHero(language);
  hideHomeEventSections();
  applySportCards(language);
  applyOpenSheetEnvironment(language);
  applyFormEnvironmentDefault();
};

export function enableUxRegressionPack() {
  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.name === "sportEnvironment") target.dataset.environmentTouched = "true";
    if (target.name === "activityText") {
      target.dataset.activityChanged = "true";
      window.queueMicrotask(applyFormEnvironmentDefault);
    }
  }, true);

  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const activity = form.querySelector<HTMLSelectElement>('select[name="activityText"]');
    const environment = form.querySelector<HTMLSelectElement>('select[name="sportEnvironment"]');
    if (!activity || !environment || environment.dataset.environmentTouched === "true") return;
    if (activity.dataset.activityChanged === "true" && isIndoorDefaultSportLabel(activity.value)) {
      environment.value = "indoor";
    }
  }, true);

  let applyScheduled = false;
  const scheduleApply = () => {
    if (applyScheduled) return;
    applyScheduled = true;
    window.queueMicrotask(() => {
      applyScheduled = false;
      applyAll();
    });
  };
  const observer = new MutationObserver(scheduleApply);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener("focus", scheduleApply);
  scheduleApply();
}
