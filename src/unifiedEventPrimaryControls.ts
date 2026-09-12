import { enhanceCinemaCards } from "./cinemaCardEnhancer";

const showControl = (node: HTMLElement, row: "participants" | "chat" | "time") => {
  if (node.hidden) node.hidden = false;
  if (node.hasAttribute("hidden")) node.removeAttribute("hidden");
  if (node.hasAttribute("aria-hidden")) node.removeAttribute("aria-hidden");
  if (node instanceof HTMLButtonElement && node.tabIndex < 0) node.tabIndex = 0;
  node.dataset.cardControlRow = row;
};

const hideMainCardMetadata = (node: HTMLElement) => {
  if (!node.hidden) node.hidden = true;
  if (node.getAttribute("aria-hidden") !== "true") node.setAttribute("aria-hidden", "true");
  node.style.setProperty("display", "none", "important");
};

const restoreLegacyControls = () => {
  document.querySelectorAll<HTMLElement>(".runtime-card-control-stack").forEach((stack) => stack.remove());

  document.querySelectorAll<HTMLElement>(".unified-event-card").forEach((card) => {
    card.querySelector<HTMLElement>(".sport-card-top-actions")?.setAttribute("data-card-control-row", "actions");

    const participants = card.querySelector<HTMLElement>(".sport-chip-row .runtime-participants-chip, .sport-chip-row .sport-card-participants-chip");
    if (participants) showControl(participants, "participants");

    const chat = card.querySelector<HTMLElement>(".sport-card-top-actions > .event-chat-unread-alert");
    if (chat) showControl(chat, "chat");

    const duration = card.querySelector<HTMLElement>(".sport-duration-chip");
    if (duration) showControl(duration, "time");

    card.querySelectorAll<HTMLElement>(".sport-level-chip, .sport-environment-chip").forEach(hideMainCardMetadata);
  });

  enhanceCinemaCards();
};

export function enableUnifiedEventPrimaryControls() {
  let scheduled = false;
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.queueMicrotask(() => {
      scheduled = false;
      restoreLegacyControls();
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["hidden", "aria-hidden", "class"],
  });
  window.addEventListener("focus", schedule);
  schedule();
}
