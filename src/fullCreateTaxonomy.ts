import {
  activityOptions,
  categories,
  closedBetaActivityOptions,
  closedBetaCategories,
} from "./data";

type ActivityOption = (typeof activityOptions)[string][number];

const repeatBoundarySelector = '.create-form input[name="recurrenceBoundary"]';

const syncRepeatPublicationCreateUx = () => {
  if (typeof document === "undefined") return;

  document.querySelectorAll<HTMLInputElement>(repeatBoundarySelector).forEach((boundaryInput) => {
    const form = boundaryInput.closest<HTMLFormElement>("form.create-form");
    const boundaryFieldset = boundaryInput.closest<HTMLFieldSetElement>("fieldset");
    if (!form || !boundaryFieldset) return;

    // ACT080-005C: Repeat is an opt-in for Telegram-confirmed future publication,
    // not a request to materialize a series. Keep the legacy form contract internally
    // by resolving its hidden boundary to the first Activity date.
    boundaryFieldset.hidden = true;
    boundaryFieldset.setAttribute("aria-hidden", "true");

    const dateInput = form.elements.namedItem("date") as HTMLInputElement | null;
    const untilInput = form.elements.namedItem("recurrenceUntilDate") as HTMLInputElement | null;
    if (!dateInput || !untilInput) return;

    const sync = () => {
      if (untilInput.value !== dateInput.value) {
        untilInput.value = dateInput.value;
        untilInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    };
    sync();
    if (dateInput.dataset.repeatPublicationDateSync !== "true") {
      dateInput.dataset.repeatPublicationDateSync = "true";
      dateInput.addEventListener("change", sync);
      dateInput.addEventListener("input", sync);
    }
  });
};

const enableRepeatPublicationCreateUx = () => {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  syncRepeatPublicationCreateUx();
  const observer = new MutationObserver(syncRepeatPublicationCreateUx);
  observer.observe(document.body, { childList: true, subtree: true });
};

export const enableFullCreateTaxonomy = () => {
  closedBetaCategories.splice(0, closedBetaCategories.length, ...categories);

  const createOptions = closedBetaActivityOptions as Record<string, ActivityOption[]>;
  for (const [categoryId, options] of Object.entries(activityOptions)) {
    createOptions[categoryId] = options;
  }

  enableRepeatPublicationCreateUx();
};
