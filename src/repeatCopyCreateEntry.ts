import { activityOptions, categories } from "./data";
import { cities, defaultCityId } from "./config/cities";
import { initializeTrustedAuth } from "./authSession";
import { useAppStore } from "./store";
import { getUserKey, supabase } from "./supabase";
import type { ActivityMetadata, Language, NewActivity } from "./types";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const repeatCopyPath = "/activities";

type RepeatCopyLocation = { pathname: string; search?: string };

type RepeatCopyEntry = {
  sourceActivityId: string;
  promptId?: string;
};

type RepeatCopySourceRow = {
  category_id: string;
  activity_ru: string;
  activity_cs: string;
  title_ru: string;
  title_cs: string;
  description_ru: string;
  description_cs: string;
  city_id: string | null;
  address: string;
  location_url: string | null;
  participant_note: string | null;
  metadata: ActivityMetadata | null;
  price: number;
  capacity: number;
  visibility: string;
};

type RepeatCopyFormSeed = {
  sourceActivityId: string;
  categoryId: string;
  activityText: string;
  descriptionText: string;
  cityId: string;
  address: string;
  locationUrl: string;
  participantNote: string;
  price: number;
  capacity: number;
  visibility: NewActivity["visibility"];
  sport?: ActivityMetadata["sport"];
};

export const resolveRepeatCopyCreateEntry = (location: RepeatCopyLocation): RepeatCopyEntry | null => {
  const pathname = (location.pathname || "").replace(/\/+$/, "") || "/";
  if (pathname !== repeatCopyPath) return null;

  const params = new URLSearchParams(location.search || "");
  if (params.get("intent") !== "repeat_copy") return null;

  const sourceActivityId = String(params.get("source") || "").toLowerCase();
  if (!uuidPattern.test(sourceActivityId)) return null;

  const rawPromptId = String(params.get("prompt") || "").toLowerCase();
  if (rawPromptId && !uuidPattern.test(rawPromptId)) return null;

  return {
    sourceActivityId,
    ...(rawPromptId ? { promptId: rawPromptId } : {}),
  };
};

const normalizeCategoryId = (categoryId: string) => {
  if (categoryId === "inline-skating") return "activities";
  return categories.some((category) => category.id === categoryId) ? categoryId : "activities";
};

const normalizeActivityName = (value: string) => value.trim().toLocaleLowerCase();

const activityTextForLanguage = (
  row: RepeatCopySourceRow,
  categoryId: string,
  language: Language,
) => {
  const sourceNames = [row.activity_ru, row.activity_cs, row.title_ru, row.title_cs]
    .map(normalizeActivityName)
    .filter(Boolean);
  const option = (activityOptions[categoryId] || []).find((candidate) =>
    Object.values(candidate.name).some((name) => sourceNames.includes(normalizeActivityName(name))),
  );
  if (option) return option.name[language];
  if (language === "cs") return row.activity_cs || row.title_cs || row.activity_ru || row.title_ru;
  return row.activity_ru || row.title_ru || row.activity_cs || row.title_cs;
};

const safeVisibility = (value: string): NewActivity["visibility"] =>
  value === "private" || value === "invite" ? value : "public";

const safeCityId = (value: string | null) =>
  value && cities.some((city) => city.id === value) ? value : defaultCityId;

const loadRepeatCopySeed = async (entry: RepeatCopyEntry): Promise<RepeatCopyFormSeed | null> => {
  await initializeTrustedAuth();
  const userKey = getUserKey();
  if (!userKey) return null;

  const result = await supabase
    .from("activities")
    .select([
      "category_id", "activity_ru", "activity_cs", "title_ru", "title_cs",
      "description_ru", "description_cs", "city_id", "address", "location_url",
      "participant_note", "metadata", "price", "capacity", "visibility",
    ].join(","))
    .eq("id", entry.sourceActivityId)
    .eq("organizer_key", userKey)
    .maybeSingle();
  if (result.error || !result.data) return null;

  const row = result.data as unknown as RepeatCopySourceRow;
  const language = useAppStore.getState().language;
  const categoryId = normalizeCategoryId(row.category_id);
  const metadata = row.metadata || undefined;

  return {
    sourceActivityId: entry.sourceActivityId,
    categoryId,
    activityText: activityTextForLanguage(row, categoryId, language),
    descriptionText: language === "cs" ? row.description_cs : row.description_ru,
    cityId: safeCityId(row.city_id),
    address: row.address,
    locationUrl: row.location_url || "",
    participantNote: row.participant_note || "",
    price: Number.isFinite(row.price) ? row.price : 0,
    capacity: Number.isFinite(row.capacity) ? row.capacity : 8,
    visibility: safeVisibility(row.visibility),
    ...(metadata?.sport ? { sport: { ...metadata.sport } } : {}),
  };
};

const nativeValueSetter = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) => {
  if (element instanceof HTMLInputElement) return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (element instanceof HTMLTextAreaElement) return Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
};

const setControlValue = (
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
) => {
  const setter = nativeValueSetter(element);
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
};

const setFormValue = (form: HTMLFormElement, name: string, value: string) => {
  const element = form.elements.namedItem(name);
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    setControlValue(element, value);
  }
};

const setInputChecked = (input: HTMLInputElement, checked: boolean) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
  if (setter) setter.call(input, checked);
  else input.checked = checked;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};

const nextFrame = () => new Promise<void>((resolve) => {
  window.requestAnimationFrame(() => resolve());
});

const waitForCreateForm = (timeoutMs = 5000) => new Promise<HTMLFormElement | null>((resolve) => {
  const existing = document.querySelector<HTMLFormElement>("form.create-form");
  if (existing) {
    resolve(existing);
    return;
  }

  const observer = new MutationObserver(() => {
    const form = document.querySelector<HTMLFormElement>("form.create-form");
    if (!form) return;
    observer.disconnect();
    window.clearTimeout(timeoutId);
    resolve(form);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  const timeoutId = window.setTimeout(() => {
    observer.disconnect();
    resolve(null);
  }, timeoutMs);
});

const waitForNamedInput = async (form: HTMLFormElement, name: string, timeoutMs = 3000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const control = form.elements.namedItem(name);
    if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
      return control;
    }
    await nextFrame();
  }
  return null;
};

const applySportSeed = async (form: HTMLFormElement, sport: ActivityMetadata["sport"]) => {
  if (!sport) return;
  await waitForNamedInput(form, "sportLevel");
  if (sport.level) setFormValue(form, "sportLevel", sport.level);
  if (sport.format) setFormValue(form, "sportFormat", sport.format);
  if (sport.environment) setFormValue(form, "sportEnvironment", sport.environment);
  if (typeof sport.durationMinutes === "number") setFormValue(form, "sportDuration", String(sport.durationMinutes));
  setFormValue(form, "sportEquipment", sport.equipment || "");
  setFormValue(form, "sportBring", sport.bring || "");
  setFormValue(form, "sportRequirements", sport.requirements || "");
  setFormValue(form, "sportOrganizerTips", sport.organizerTips || "");

  const equipmentNeeded = form.elements.namedItem("sportEquipmentNeeded");
  if (equipmentNeeded instanceof HTMLInputElement) setInputChecked(equipmentNeeded, sport.equipmentNeeded === true);
};

const clearRepeatCopyUrl = () => {
  if (window.location.pathname.replace(/\/+$/, "") !== repeatCopyPath) return;
  window.history.replaceState({}, "", repeatCopyPath);
};

const applyRepeatCopySeed = async (form: HTMLFormElement, seed: RepeatCopyFormSeed) => {
  setFormValue(form, "categoryId", seed.categoryId);
  setFormValue(form, "cityId", seed.cityId);
  await nextFrame();
  await nextFrame();

  const activitySelect = form.elements.namedItem("activityText");
  if (activitySelect instanceof HTMLSelectElement
    && Array.from(activitySelect.options).some((option) => option.value === seed.activityText)) {
    setControlValue(activitySelect, seed.activityText);
  }
  setFormValue(form, "descriptionText", seed.descriptionText);
  setFormValue(form, "date", "");
  setFormValue(form, "time", "");
  setFormValue(form, "address", seed.address);
  await nextFrame();
  setFormValue(form, "locationUrl", seed.locationUrl);
  setFormValue(form, "participantNote", seed.participantNote);
  setFormValue(form, "price", String(seed.price));
  setFormValue(form, "capacity", String(seed.capacity));

  form.querySelectorAll<HTMLInputElement>('input[name="visibility"]').forEach((input) => {
    setInputChecked(input, input.value === seed.visibility);
  });

  if (seed.categoryId === "sport") await applySportSeed(form, seed.sport);

  form.dataset.repeatCopySource = seed.sourceActivityId;
  form.addEventListener("submit", clearRepeatCopyUrl, { once: true });
  form.closest(".create-page")?.querySelector<HTMLButtonElement>(".back-button")
    ?.addEventListener("click", clearRepeatCopyUrl, { once: true });
};

const startRepeatCopyCreateEntry = async (entry: RepeatCopyEntry) => {
  const seed = await loadRepeatCopySeed(entry);
  if (!seed) return;

  const state = useAppStore.getState();
  state.setSelectedCity(seed.cityId);
  state.setView("create");

  const form = await waitForCreateForm();
  if (!form) return;
  await applyRepeatCopySeed(form, seed);
};

export const enableRepeatCopyCreateEntry = () => {
  if (typeof window === "undefined" || typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  const entry = resolveRepeatCopyCreateEntry(window.location);
  if (!entry) return;
  void startRepeatCopyCreateEntry(entry);
};
