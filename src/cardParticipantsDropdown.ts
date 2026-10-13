import { stripLeadingEmoji } from "./cardText";
import { getTranslation } from "./i18n";
import { organizerInitials, resolveOrganizerIdentity } from "./profile/organizerIdentityResolver";
import { useAppStore } from "./store";
import { supabase } from "./supabase";
import { getNamedTeamsActorUserKey } from "./people/namedTeamsActor";
import { SupabaseNamedTeamsRepository } from "./people/namedTeamsRepository";
import { selectOwnTeams } from "./people/ownTeams";
import type { Activity, ActivityMember, Language } from "./types";

const normalizeText = (value: string | null | undefined) =>
  String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/\s+/g, " ").trim();

const currentLanguage = (): Language => {
  const visible = document.querySelector<HTMLElement>(".language-control span")?.textContent?.trim().toUpperCase();
  if (visible === "RU" || visible === "UK" || visible === "CS" || visible === "EN") return visible.toLowerCase() as Language;
  return useAppStore.getState().language;
};

const activityLabel = (activity: Activity, language: Language) =>
  normalizeText(stripLeadingEmoji(activity.activity[language] || activity.activity.en || activity.activity.ru));
const activityTitle = (activity: Activity, language: Language) =>
  normalizeText(stripLeadingEmoji(activity.title[language] || activity.title.en || activity.title.ru));

export const resolveParticipantActivityById = (activities: Activity[], activityId: string | null | undefined) =>
  activityId ? activities.find((activity) => activity.id === activityId) || null : null;

export const participantSheetTitleMatches = (activity: Activity, language: Language, heading: string | null | undefined) =>
  activityTitle(activity, language) === normalizeText(heading);

const activityIdForCard = (card: HTMLElement) =>
  card.querySelector<HTMLElement>(".card-reminder-action[data-activity-id]")?.dataset.activityId?.trim() || null;

let lastOpenedActivityId: string | null = null;

const findActivityForCard = (card: HTMLElement, language: Language) => {
  const candidates = useAppStore.getState().activities;
  const exact = resolveParticipantActivityById(candidates, activityIdForCard(card));
  if (exact) return exact;

  const heading = normalizeText(card.querySelector("h3")?.textContent);
  const subtitle = normalizeText(card.querySelector(".sport-card-main p")?.textContent);
  return candidates.find((activity) => activityLabel(activity, language) === heading && activityTitle(activity, language) === subtitle)
    || candidates.find((activity) => activityLabel(activity, language) === heading)
    || candidates.find((activity) => activityLabel(activity, language).includes(heading) || heading.includes(activityLabel(activity, language)))
    || null;
};

const findActivityForSheet = (sheet: HTMLElement, language: Language) => {
  const heading = normalizeText(sheet.querySelector("h2")?.textContent);
  if (!heading) return null;
  const candidates = useAppStore.getState().activities;
  const exact = resolveParticipantActivityById(candidates, lastOpenedActivityId);
  if (exact && participantSheetTitleMatches(exact, language, heading)) return exact;
  return candidates.find((activity) => activityTitle(activity, language) === heading)
    || candidates.find((activity) => Object.values(activity.title).some((title) => normalizeText(stripLeadingEmoji(title)) === heading))
    || null;
};

export const joinedParticipants = (activity: Activity): ActivityMember[] =>
  activity.members.filter((member) => member.status === "joined");

export const calculateParticipantPanelWidth = (longestNameWidth: number, headerWidth: number, sheet: boolean) => {
  const panelChrome = sheet ? 111 : 105;
  const headerChrome = sheet ? 26 : 22;
  return Math.ceil(Math.max(200, longestNameWidth + panelChrome, headerWidth + headerChrome));
};

const sheetDropdownAnchor = new WeakMap<HTMLElement, HTMLElement>();
const sheetDropdownByToggle = new WeakMap<HTMLElement, HTMLElement>();

const closeAllDropdowns = (except?: HTMLElement) => {
  document.querySelectorAll<HTMLElement>(".runtime-card-participants-dropdown, .runtime-sheet-participants-dropdown").forEach((dropdown) => {
    if (dropdown === except) return;
    const anchor = sheetDropdownAnchor.get(dropdown);
    if (anchor) {
      anchor.setAttribute("aria-expanded", "false");
      dropdown.remove();
      return;
    }
    dropdown.hidden = true;
  });
  document.querySelectorAll<HTMLElement>(".runtime-participants-chip").forEach((chip) => {
    const dropdown = chip.parentElement?.querySelector<HTMLElement>(".runtime-card-participants-dropdown");
    chip.setAttribute("aria-expanded", dropdown && !dropdown.hidden ? "true" : "false");
  });
};

const isImageAvatar = (value: string) => value.startsWith("data:image/") || /^https?:\/\//.test(value);

const measureText = (element: HTMLElement, value: string) => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const style = getComputedStyle(element);
  if (!context) return element.scrollWidth;
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return context.measureText(value).width;
};

const horizontalExtras = (element: HTMLElement) => {
  const style = getComputedStyle(element);
  return [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth]
    .reduce((sum, value) => sum + (Number.parseFloat(value) || 0), 0);
};

const syncDropdownWidth = (dropdown: HTMLElement) => {
  const names = Array.from(dropdown.querySelectorAll<HTMLElement>(".runtime-card-participant-row > strong"));
  const title = dropdown.querySelector<HTMLElement>(".runtime-card-participants-header > strong");
  const count = dropdown.querySelector<HTMLElement>(".runtime-card-participants-header > span");
  const longest = names.length
    ? Math.max(...names.map((name) => measureText(name, name.textContent || "")))
    : 100;
  const titleWidth = title ? measureText(title, title.textContent || "") : 0;
  const countWidth = count ? measureText(count, count.textContent || "") + horizontalExtras(count) : 0;
  const headerWidth = titleWidth + countWidth + 16;
  const sheet = dropdown.classList.contains("runtime-sheet-participants-dropdown");
  const panelWidth = calculateParticipantPanelWidth(longest, headerWidth, sheet);
  dropdown.style.setProperty("--participant-name-width", `${Math.ceil(longest)}px`);
  dropdown.style.setProperty("--participant-panel-width", `${panelWidth}px`);
};

const placeSheetDropdown = (toggle: HTMLElement, dropdown: HTMLElement) => {
  const margin = 12;
  const gap = 8;
  const triggerRect = toggle.getBoundingClientRect();
  const panelRect = dropdown.getBoundingClientRect();
  const width = Math.min(panelRect.width || 200, window.innerWidth - margin * 2);
  const height = Math.min(dropdown.scrollHeight || panelRect.height, 260, window.innerHeight - margin * 2);
  const left = Math.min(
    Math.max(margin, triggerRect.right - width),
    Math.max(margin, window.innerWidth - width - margin),
  );
  const below = triggerRect.bottom + gap;
  const top = below + height <= window.innerHeight - margin
    ? below
    : Math.max(margin, triggerRect.top - height - gap);
  dropdown.style.left = `${Math.round(left)}px`;
  dropdown.style.top = `${Math.round(top)}px`;
};

const loadParticipantIdentity = async (avatar: HTMLElement, name: HTMLElement, member: ActivityMember, dropdown: HTMLElement) => {
  const fallback = organizerInitials(member.name);
  avatar.textContent = fallback;
  name.textContent = member.name;
  const identity = await resolveOrganizerIdentity(member.userKey, member.name);
  if (!avatar.isConnected || !name.isConnected) return;
  name.textContent = identity.displayName || member.name;
  if (!isImageAvatar(identity.avatar)) avatar.textContent = identity.avatar || fallback;
  else {
    const image = document.createElement("img");
    image.alt = "";
    image.src = identity.avatar;
    image.addEventListener("error", () => image.replaceWith(fallback), { once: true });
    avatar.replaceChildren(image);
  }
  syncDropdownWidth(dropdown);
  const anchor = sheetDropdownAnchor.get(dropdown);
  if (anchor && dropdown.isConnected && !dropdown.hidden) placeSheetDropdown(anchor, dropdown);
};

const openEventParticipantProfile = async (member: ActivityMember, language: Language) => {
  document.querySelector(".event-participant-profile-overlay")?.remove();
  const overlay = document.createElement("div");
  overlay.className = "event-participant-profile-overlay";
  overlay.style.cssText = "position:fixed;inset:0;z-index:2147483640;background:rgba(0,0,0,.75);display:flex;align-items:center;justify-content:center;padding:18px;box-sizing:border-box";
  const panel = document.createElement("section");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", member.name);
  panel.style.cssText = "width:min(100%,420px);max-height:85vh;overflow:auto;background:#15191b;color:#f5f5f5;border:1px solid #53672b;border-radius:18px;padding:20px;box-sizing:border-box;display:grid;gap:14px";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "Close");
  close.style.cssText = "justify-self:end;background:transparent;color:inherit;border:0;font-size:30px;cursor:pointer";
  close.onclick = () => overlay.remove();
  const heading = document.createElement("h2");
  heading.textContent = member.name;
  heading.style.cssText = "margin:0;overflow-wrap:anywhere";
  const info = document.createElement("p");
  info.textContent = language === "ru" ? "Загрузка профиля…" : "Loading profile…";
  info.style.margin = "0";
  const teamSection = document.createElement("div");
  teamSection.style.cssText = "display:grid;gap:12px";
  teamSection.setAttribute("aria-busy", "true");
  const teamLabel = document.createElement("label");
  teamLabel.textContent = language === "ru" ? "Добавить в команду" : "Add to team";
  const select = document.createElement("select");
  select.style.cssText = "width:100%;padding:12px;border-radius:10px;background:#252a2b;color:white;border:1px solid #637b35";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = language === "ru" ? "Выберите команду" : "Select a team";
  select.append(option);
  const add = document.createElement("button");
  add.type = "button";
  add.textContent = language === "ru" ? "Добавить" : "Add";
  add.disabled = true;
  add.style.cssText = "padding:12px;border-radius:10px;background:#b8db65;color:#111;border:0;font-weight:700";
  const feedback = document.createElement("p");
  feedback.setAttribute("role", "status");
  feedback.style.margin = "0";
  teamSection.append(teamLabel, select, add, feedback);
  panel.append(close, heading, info, teamSection);
  select.disabled = true;
  teamLabel.textContent = language === "ru" ? "Проверяем доступные команды…" : "Checking available teams…";
  overlay.append(panel);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) overlay.remove(); });
  document.body.append(overlay);
  close.focus();
  try {
    const identity = await resolveOrganizerIdentity(member.userKey, member.name);
    if (!overlay.isConnected) return;
    heading.textContent = identity.displayName || member.name;
    info.textContent = identity.bio || (language === "ru" ? "Публичная информация не указана" : "No public bio");
    const actor = getNamedTeamsActorUserKey();
    if (!actor || actor === member.userKey) {
      teamSection.remove();
      return;
    }
    const repository = new SupabaseNamedTeamsRepository(supabase, actor);
    const [teams, memberships] = await Promise.all([repository.listTeams(), repository.listOwnMemberships()]);
    if (!overlay.isConnected) return;
    const owned = selectOwnTeams(teams, memberships, actor).filter(({ membership }) => membership.status === "active" && (membership.role === "owner" || membership.role === "admin"));
    owned.forEach((team) => {
      const item = document.createElement("option");
      item.value = team.team.id;
      item.textContent = team.team.name;
      select.append(item);
    });
    teamSection.setAttribute("aria-busy", "false");
    if (!owned.length) {
      teamLabel.textContent = language === "ru" ? "Добавление в команду недоступно" : "Team add unavailable";
      feedback.textContent = language === "ru" ? "Нет доступных команд с правами владельца или администратора." : "No teams with owner or admin permissions.";
      select.remove(); add.remove();
      return;
    }
    teamLabel.textContent = language === "ru" ? "Добавить в команду" : "Add to team";
    select.disabled = false;
    select.onchange = () => { add.disabled = !select.value; };
    add.onclick = async () => {
      if (!select.value) return;
      add.disabled = true;
      feedback.textContent = "";
      try {
        await repository.membershipAction(select.value, "add", member.userKey);
        feedback.textContent = language === "ru" ? "Участник добавлен в команду" : "Member added";
      } catch (error) {
        const blocked = String(error).includes("direct_team_add_blocked");
        feedback.textContent = blocked
          ? (language === "ru" ? "Пользователь запретил прямое добавление в команды" : "User does not allow direct team adds")
          : (language === "ru" ? "Не удалось добавить участника" : "Unable to add member");
      } finally { add.disabled = !select.value; }
    };
  } catch {
    if (!overlay.isConnected) return;
    teamSection.setAttribute("aria-busy", "false");
    teamLabel.textContent = language === "ru" ? "Добавление в команду недоступно" : "Team add unavailable";
    feedback.textContent = language === "ru" ? "Не удалось загрузить список команд. Повторите попытку позже." : "Unable to load teams. Please try again.";
    select.remove(); add.remove();
  }
};

const renderDropdown = (dropdown: HTMLElement, activity: Activity, language: Language) => {
  const t = getTranslation(language);
  const members = joinedParticipants(activity);
  dropdown.replaceChildren();
  const header = document.createElement("div");
  header.className = "runtime-card-participants-header";
  const title = document.createElement("strong");
  title.textContent = t.participants;
  const count = document.createElement("span");
  count.textContent = `${activity.participants} / ${activity.capacity}`;
  header.append(title, count);
  dropdown.append(header);

  const list = document.createElement("div");
  list.className = "runtime-card-participants-list";
  if (!members.length) {
    const empty = document.createElement("p");
    empty.textContent = t.noParticipants;
    list.append(empty);
  } else {
    members.forEach((member) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "runtime-card-participant-row";
      row.style.cssText = "width:100%;text-align:left;cursor:pointer;color:inherit;font:inherit;border:0";
      row.setAttribute("aria-label", member.name);
      row.addEventListener("click", (event) => { event.stopPropagation(); void openEventParticipantProfile(member, language); });
      const avatar = document.createElement("span");
      avatar.className = "runtime-card-participant-avatar";
      const name = document.createElement("strong");
      name.textContent = member.name;
      row.append(avatar, name);
      list.append(row);
      void loadParticipantIdentity(avatar, name, member, dropdown);
    });
  }
  dropdown.append(list);
  syncDropdownWidth(dropdown);
};

const ensureCardDropdown = (chip: HTMLElement, card: HTMLElement, activity: Activity, language: Language) => {
  let dropdown = chip.parentElement?.querySelector<HTMLElement>(".runtime-card-participants-dropdown") || null;
  if (!dropdown) {
    dropdown = document.createElement("div");
    dropdown.className = "runtime-card-participants-dropdown";
    dropdown.hidden = true;
    dropdown.setAttribute("role", "region");
    chip.parentElement?.append(dropdown);
  }
  renderDropdown(dropdown, activity, language);
  chip.setAttribute("aria-haspopup", "true");
  chip.setAttribute("aria-expanded", dropdown.hidden ? "false" : "true");
  card.classList.add("has-runtime-participants-dropdown");
  return dropdown;
};

const ensureSheetDropdown = (toggle: HTMLElement, activity: Activity, language: Language) => {
  let dropdown = sheetDropdownByToggle.get(toggle) || null;
  if (!dropdown?.isConnected) {
    dropdown = document.createElement("div");
    dropdown.className = "runtime-sheet-participants-dropdown runtime-sheet-participants-portal";
    dropdown.hidden = true;
    dropdown.setAttribute("role", "region");
    document.body.append(dropdown);
    sheetDropdownByToggle.set(toggle, dropdown);
    sheetDropdownAnchor.set(dropdown, toggle);
  }
  renderDropdown(dropdown, activity, language);
  toggle.setAttribute("aria-haspopup", "true");
  toggle.setAttribute("aria-expanded", dropdown.hidden ? "false" : "true");
  return dropdown;
};

const toggleDropdown = (trigger: HTMLElement, dropdown: HTMLElement) => {
  const opening = dropdown.hidden;
  if (!opening) {
    trigger.setAttribute("aria-expanded", "false");
    if (sheetDropdownAnchor.has(dropdown)) dropdown.remove();
    else dropdown.hidden = true;
    return;
  }
  closeAllDropdowns(dropdown);
  dropdown.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  if (sheetDropdownAnchor.has(dropdown)) {
    window.requestAnimationFrame(() => {
      if (dropdown.isConnected && !dropdown.hidden) placeSheetDropdown(trigger, dropdown);
    });
  }
};

const handleParticipantsClick = (event: Event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const clickedCard = target.closest<HTMLElement>(".compact-sport-card");
  const clickedActivityId = clickedCard ? activityIdForCard(clickedCard) : null;
  if (clickedActivityId) lastOpenedActivityId = clickedActivityId;

  const chip = target.closest<HTMLElement>(".runtime-participants-chip");
  if (chip) {
    const card = chip.closest<HTMLElement>(".compact-sport-card");
    if (!card) return;
    const language = currentLanguage();
    const activity = findActivityForCard(card, language);
    if (!activity) return;
    lastOpenedActivityId = activity.id;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    toggleDropdown(chip, ensureCardDropdown(chip, card, activity, language));
    return;
  }

  const toggle = target.closest<HTMLElement>(".sport-sheet .detail-members-toggle, .activity-sheet .detail-members-toggle");
  if (!toggle) return;
  const sheet = toggle.closest<HTMLElement>(".sport-sheet, .activity-sheet");
  if (!sheet) return;
  const language = currentLanguage();
  const activity = findActivityForSheet(sheet, language);
  if (!activity) return;
  event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
  toggleDropdown(toggle, ensureSheetDropdown(toggle, activity, language));
};

const removeCompetingChipListeners = () => {
  document.querySelectorAll<HTMLElement>(".runtime-participants-chip:not([data-participants-dropdown-ready])").forEach((chip) => {
    const clean = chip.cloneNode(true) as HTMLElement;
    clean.dataset.participantsDropdownReady = "true";
    chip.replaceWith(clean);
  });
  document.querySelectorAll<HTMLElement>(".runtime-sheet-participants-portal").forEach((dropdown) => {
    const anchor = sheetDropdownAnchor.get(dropdown);
    if (!anchor?.isConnected) dropdown.remove();
  });
};

export function enableCardParticipantsDropdown() {
  const observer = new MutationObserver(removeCompetingChipListeners);
  observer.observe(document.body, { childList: true, subtree: true });
  removeCompetingChipListeners();
  document.addEventListener("click", handleParticipantsClick, true);
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || target.closest(".runtime-participants-chip, .runtime-card-participants-dropdown, .detail-members-toggle, .runtime-sheet-participants-dropdown")) return;
    closeAllDropdowns();
  });
  document.addEventListener("scroll", (event) => {
    const target = event.target;
    if (target instanceof Element && target.closest(".runtime-sheet-participants-dropdown")) return;
    closeAllDropdowns();
  }, true);
  window.addEventListener("resize", () => closeAllDropdowns());
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeAllDropdowns(); });
}
