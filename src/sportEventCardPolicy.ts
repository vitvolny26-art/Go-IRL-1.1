import { useAppStore } from "./store";
import type { Activity, Language, NewActivity, SportEnvironment, SportFormat, SportLevel, SportMetadata } from "./types";

type Selection = { level?: SportLevel; format?: SportFormat; environment?: SportEnvironment };

const copy: Record<Language, { optional: string; required: string; choose: string }> = {
  ru: { optional: "Необязательно", required: "Обязательно", choose: "Выберите: на улице или в помещении" },
  uk: { optional: "Необов’язково", required: "Обов’язково", choose: "Оберіть: надворі або в приміщенні" },
  cs: { optional: "Volitelné", required: "Povinné", choose: "Vyberte: venku nebo uvnitř" },
  en: { optional: "Optional", required: "Required", choose: "Choose: outdoor or indoor" },
  pl: { optional: "Optional", required: "Required", choose: "Choose: outdoor or indoor" },
  sk: { optional: "Volitelné", required: "Povinné", choose: "Vyberte: venku nebo uvnitř" },
};

const norm = (value?: string | null) => String(value || "").normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/\s+/g, " ").trim();

const language = (): Language => {
  const code = document.querySelector<HTMLElement>(".language-control span")?.textContent?.trim().toLowerCase();
  return code === "ru" || code === "uk" || code === "cs" || code === "en"
    ? code
    : useAppStore.getState().language;
};

export const applySportFormSelection = (activity: NewActivity, selected: Selection): NewActivity => {
  if (activity.categoryId !== "sport" && activity.type !== "sport") return activity;
  const sport: SportMetadata = { ...(activity.metadata?.sport || {}) };
  if (selected.level) sport.level = selected.level; else delete sport.level;
  if (selected.format) sport.format = selected.format; else delete sport.format;
  if (selected.environment) sport.environment = selected.environment; else delete sport.environment;
  return { ...activity, metadata: { ...activity.metadata, sport } };
};

export const setTextContentIfChanged = (
  node: { textContent: string | null },
  text: string,
) => {
  if (node.textContent === text) return false;
  node.textContent = text;
  return true;
};

let pending: Selection | null = null;
let patched = false;

const patchWrites = () => {
  if (patched) return;
  patched = true;
  const { createActivity, updateActivity } = useAppStore.getState();
  useAppStore.setState({
    createActivity: async (activity: NewActivity) => {
      const selected = pending;
      pending = null;
      return createActivity(selected ? applySportFormSelection(activity, selected) : activity);
    },
    updateActivity: async (id: string, activity: NewActivity) => {
      const selected = pending;
      pending = null;
      return updateActivity(id, selected ? applySportFormSelection(activity, selected) : activity);
    },
  });
};

const option = (select: HTMLSelectElement, label: string, disabled = false) => {
  let empty = Array.from(select.options).find((item) => item.value === "");
  if (!empty) {
    empty = document.createElement("option");
    empty.value = "";
    select.prepend(empty);
  }
  setTextContentIfChanged(empty, label);
  empty.disabled = disabled;
};

const marker = (select: HTMLSelectElement, text: string, kind: "optional" | "required") => {
  const host = select.closest<HTMLLabelElement>("label")?.querySelector(":scope > span");
  if (!host) return;
  let node = host.querySelector<HTMLElement>(`.sport-policy-${kind}-marker`);
  if (!node) {
    node = document.createElement("small");
    node.className = `sport-policy-field-marker sport-policy-${kind}-marker`;
    host.append(node);
  }
  setTextContentIfChanged(node, text);
};

const editingActivity = (form: HTMLFormElement, lang: Language) => {
  const title = norm(form.querySelector<HTMLInputElement>('input[name="titleText"]')?.defaultValue);
  if (!title) return null;
  return useAppStore.getState().activities.find((item: Activity) =>
    [item.title[lang], item.title.en, item.title.ru].some((value) => norm(value) === title)) || null;
};

const configureForm = (form: HTMLFormElement, lang: Language) => {
  const level = form.querySelector<HTMLSelectElement>('select[name="sportLevel"]');
  const format = form.querySelector<HTMLSelectElement>('select[name="sportFormat"]');
  const environment = form.querySelector<HTMLSelectElement>('select[name="sportEnvironment"]');
  if (!level || !format || !environment) return;

  option(level, copy[lang].optional);
  option(format, copy[lang].optional);
  option(environment, copy[lang].choose, true);
  level.required = false;
  format.required = false;
  environment.required = true;
  level.closest(".form-row")?.classList.add("sport-policy-optional-row");
  environment.closest(".form-row")?.classList.add("sport-policy-required-row");
  marker(level, copy[lang].optional, "optional");
  marker(format, copy[lang].optional, "optional");
  marker(environment, copy[lang].required, "required");

  if (environment.dataset.sportPolicyInitialized !== "true") {
    const sport = editingActivity(form, lang)?.metadata?.sport;
    level.value = sport?.level || "";
    format.value = sport?.format || "";
    environment.value = sport?.environment || "";
    level.dataset.sportPolicyInitialized = "true";
    format.dataset.sportPolicyInitialized = "true";
    environment.dataset.sportPolicyInitialized = "true";
  }
};

const selection = (form: HTMLFormElement): Selection | null => {
  const environment = form.querySelector<HTMLSelectElement>('select[name="sportEnvironment"]');
  if (!environment) return null;
  const level = form.querySelector<HTMLSelectElement>('select[name="sportLevel"]');
  const format = form.querySelector<HTMLSelectElement>('select[name="sportFormat"]');
  return {
    level: level?.value ? level.value as SportLevel : undefined,
    format: format?.value ? format.value as SportFormat : undefined,
    environment: environment.value ? environment.value as SportEnvironment : undefined,
  };
};

const activityForCard = (card: HTMLElement, lang: Language) => {
  const heading = norm(card.querySelector("h3")?.textContent);
  const subtitle = norm(card.querySelector(".sport-card-main p")?.textContent);
  const items = useAppStore.getState().activities.filter((item: Activity) =>
    item.type === "sport" || item.categoryId === "sport");
  return items.find((item: Activity) =>
    norm(item.activity[lang] || item.activity.en) === heading
    && norm(item.title[lang] || item.title.en) === subtitle)
    || items.find((item: Activity) => norm(item.activity[lang] || item.activity.en) === heading)
    || null;
};

const restoreLegacyControls = (card: HTMLElement) => {
  card.querySelector<HTMLElement>(".runtime-card-control-stack")?.remove();
  const participants = card.querySelector<HTMLButtonElement>(".sport-chip-row .runtime-participants-chip");
  if (participants) {
    participants.hidden = false;
    participants.tabIndex = 0;
    participants.removeAttribute("aria-hidden");
  }
  const chat = card.querySelector<HTMLButtonElement>(".sport-card-top-actions > .event-chat-unread-alert");
  if (chat) {
    chat.hidden = false;
    chat.tabIndex = 0;
    chat.removeAttribute("aria-hidden");
  }
};

const metadata = (card: HTMLElement, activity: Activity) => {
  const row = card.querySelector<HTMLElement>(".sport-chip-row");
  if (!row) return;
  const sport = activity.metadata?.sport || {};
  const level = row.querySelector<HTMLElement>(".sport-level-chip");
  const environment = row.querySelector<HTMLElement>(".sport-environment-chip");
  const duration = row.querySelector<HTMLElement>(".sport-duration-chip");
  if (level) level.hidden = true;
  if (environment) environment.hidden = true;
  if (duration) duration.hidden = !sport.durationMinutes;
  row.classList.remove("sport-policy-metadata-row");
};

const sheet = (lang: Language) => {
  const root = document.querySelector<HTMLElement>(".sport-sheet");
  const heading = norm(root?.querySelector("h2")?.textContent);
  if (!root || !heading) return;
  const activity = useAppStore.getState().activities.find((item: Activity) =>
    (item.type === "sport" || item.categoryId === "sport")
    && norm(item.title[lang] || item.title.en) === heading);
  if (!activity) return;
  const sport = activity.metadata?.sport || {};
  const chips = root.querySelectorAll<HTMLElement>(".sport-sheet-chips > span");
  if (chips[1]) chips[1].hidden = !sport.level;
  if (chips[2]) chips[2].hidden = !sport.environment;
  if (chips[3]) chips[3].hidden = !sport.durationMinutes;
  const format = root.querySelector<HTMLElement>(".sport-detail-list > div:first-child");
  if (format) format.hidden = !sport.format;
};

const apply = () => {
  const lang = language();
  document.querySelectorAll<HTMLFormElement>("form.create-form").forEach((form) => configureForm(form, lang));
  document.querySelectorAll<HTMLElement>(".compact-sport-card").forEach((card) => {
    const activity = activityForCard(card, lang);
    if (!activity) return;
    restoreLegacyControls(card);
    metadata(card, activity);
  });
  sheet(lang);
};

export function enableSportEventCardPolicy() {
  patchWrites();
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const selected = selection(form);
    if (!selected) return;
    pending = selected;
    const captured = pending;
    window.setTimeout(() => { if (pending === captured) pending = null; }, 0);
  }, true);

  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.queueMicrotask(() => {
      scheduled = false;
      apply();
    });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener("focus", schedule);
  schedule();
}
