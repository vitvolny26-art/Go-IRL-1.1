import type { Language } from "./types";

export type CityScheduleSlot = {
  id: string;
  date: string;
  time: string;
  venueId: string;
  venueName: string;
  venueAddress?: string | null;
  actionUrl?: string | null;
  tags?: string[];
};

type CityScheduleCalendarOptions = {
  slots: CityScheduleSlot[];
  language: Language;
  maxDays?: number;
  onSlotClick?: (slot: CityScheduleSlot) => void;
};

const localeByLanguage: Record<Language, string> = {
  ru: "ru-RU",
  uk: "uk-UA",
  cs: "cs-CZ",
  en: "en-US",
};

const copy: Record<Language, { today: string; tomorrow: string; screenings: string }> = {
  ru: { today: "Сегодня", tomorrow: "Завтра", screenings: "сеансов" },
  uk: { today: "Сьогодні", tomorrow: "Завтра", screenings: "сеансів" },
  cs: { today: "Dnes", tomorrow: "Zítra", screenings: "projekcí" },
  en: { today: "Today", tomorrow: "Tomorrow", screenings: "shows" },
};

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const localDateKey = (value = new Date()) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const dateLabel = (date: string, language: Language) => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (date === localDateKey(today)) return copy[language].today;
  if (date === localDateKey(tomorrow)) return copy[language].tomorrow;
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(localeByLanguage[language], {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parsed);
};

const uniqueTags = (values: string[] | undefined) => [...new Set((values || []).map((value) => value.trim()).filter(Boolean))].slice(0, 3);

export const createCityScheduleCalendar = ({
  slots,
  language,
  maxDays = 7,
  onSlotClick,
}: CityScheduleCalendarOptions) => {
  const root = element("div", "city-schedule-calendar");
  const sortedSlots = [...slots].sort((left, right) => `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`));
  const dates = [...new Set(sortedSlots.map((slot) => slot.date))].slice(0, Math.max(1, maxDays));
  let selectedDate = dates[0] || "";

  const dateStrip = element("div", "city-schedule-calendar__dates");
  dateStrip.setAttribute("role", "tablist");
  dateStrip.setAttribute("aria-label", "Schedule dates");
  const venueList = element("div", "city-schedule-calendar__venues");

  const renderVenues = () => {
    venueList.replaceChildren();
    const daySlots = sortedSlots.filter((slot) => slot.date === selectedDate);
    const byVenue = new Map<string, CityScheduleSlot[]>();
    daySlots.forEach((slot) => {
      const group = byVenue.get(slot.venueId) || [];
      group.push(slot);
      byVenue.set(slot.venueId, group);
    });

    byVenue.forEach((venueSlots) => {
      const first = venueSlots[0];
      const group = element("section", "city-schedule-calendar__venue");
      const heading = element("div", "city-schedule-calendar__venue-heading");
      const venueCopy = element("div", "city-schedule-calendar__venue-copy");
      venueCopy.append(element("strong", "city-schedule-calendar__venue-name", first.venueName));
      if (first.venueAddress) venueCopy.append(element("span", "city-schedule-calendar__venue-address", first.venueAddress));
      heading.append(venueCopy, element("span", "city-schedule-calendar__venue-count", String(venueSlots.length)));
      group.append(heading);

      const times = element("div", "city-schedule-calendar__times");
      venueSlots.forEach((slot) => {
        const hasAction = Boolean(slot.actionUrl || onSlotClick);
        const control = hasAction ? element(slot.actionUrl ? "a" : "button", "city-schedule-calendar__time") : element("span", "city-schedule-calendar__time is-static");
        if (control instanceof HTMLButtonElement) control.type = "button";
        if (control instanceof HTMLAnchorElement && slot.actionUrl) {
          control.href = slot.actionUrl;
          control.target = "_blank";
          control.rel = "noopener noreferrer";
        }
        control.append(element("strong", "city-schedule-calendar__time-value", slot.time));
        const tags = uniqueTags(slot.tags);
        if (tags.length) {
          const tagRow = element("span", "city-schedule-calendar__slot-tags");
          tags.forEach((tag) => tagRow.append(element("span", "city-schedule-calendar__slot-tag", tag)));
          control.append(tagRow);
        }
        if (onSlotClick) {
          control.addEventListener("click", (event) => {
            if (!slot.actionUrl) event.preventDefault();
            onSlotClick(slot);
          });
        }
        times.append(control);
      });
      group.append(times);
      venueList.append(group);
    });
  };

  const updateDateSelection = () => {
    dateStrip.querySelectorAll<HTMLButtonElement>(".city-schedule-calendar__date").forEach((button) => {
      const selected = button.dataset.date === selectedDate;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
      button.tabIndex = selected ? 0 : -1;
    });
    renderVenues();
  };

  dates.forEach((date) => {
    const daySlots = sortedSlots.filter((slot) => slot.date === date);
    const button = element("button", "city-schedule-calendar__date");
    button.type = "button";
    button.dataset.date = date;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-label", `${dateLabel(date, language)} · ${daySlots.length} ${copy[language].screenings}`);
    button.append(
      element("span", "city-schedule-calendar__date-label", dateLabel(date, language)),
      element("span", "city-schedule-calendar__date-count", String(daySlots.length)),
    );
    button.addEventListener("click", () => {
      selectedDate = date;
      updateDateSelection();
    });
    dateStrip.append(button);
  });

  root.append(dateStrip, venueList);
  updateDateSelection();
  return root;
};
