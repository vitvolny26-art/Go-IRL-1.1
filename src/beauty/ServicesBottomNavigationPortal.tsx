import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CircleUserRound } from "lucide-react";
import { clientNavigationLabels } from "../domainHomeCategories";
import { enterCanonicalProfile, type ProfileEntryHistoryMode } from "../profile/profileEntry";
import { useAppStore } from "../store";
import { BeautyMasterWorkspacePage } from "./BeautyMasterWorkspacePage";
import { canShowBeautyWorkspaceEntry, servicesBottomNavigationCount } from "./servicesRoleNavigation";
import { useBeautyProfessionalPendingBookings } from "./useBeautyProfessionalPendingBookings";

const normalizedPath = () => window.location.pathname.replace(/\/+$/, "");
const isServicesPath = () => normalizedPath() === "/services";
const isMasterWorkspacePath = () => {
  const path = normalizedPath();
  return path === "/beauty/workspace" || path === "/services/beauty/master";
};

const openCanonicalProfile = (mode: ProfileEntryHistoryMode = "push") => {
  const currentView = useAppStore.getState().view;
  enterCanonicalProfile({
    currentView,
    setView: (nextView) => useAppStore.getState().setView(nextView),
    history: window.history,
    mode,
    schedule: (callback) => { window.requestAnimationFrame(() => callback()); },
  });
};

export function ServicesBottomNavigationPortal() {
  const language = useAppStore((state) => state.language);
  const view = useAppStore((state) => state.view);
  const userRole = useAppStore((state) => state.userRole);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [workspaceLinkTarget, setWorkspaceLinkTarget] = useState<HTMLAnchorElement | null>(null);
  const servicesPath = typeof window !== "undefined" && isServicesPath();
  const masterWorkspacePath = typeof window !== "undefined" && isMasterWorkspacePath();
  const showWorkspace = canShowBeautyWorkspaceEntry(userRole);
  const pendingBookings = useBeautyProfessionalPendingBookings(language, userRole, servicesPath && showWorkspace);
  const pendingCount = pendingBookings.length;

  useEffect(() => {
    const handleProfileReopen = (event: MouseEvent) => {
      if (useAppStore.getState().view !== "profile") return;
      if (!document.querySelector(".profile-page.is-editing")) return;
      const element = event.target instanceof Element ? event.target : null;
      const button = element?.closest<HTMLButtonElement>(".bottom-nav button");
      if (!button || button.hasAttribute("data-services-profile-tab")) return;
      const currentLanguage = useAppStore.getState().language;
      if (button.textContent?.trim() !== clientNavigationLabels[currentLanguage][4]) return;

      event.preventDefault();
      event.stopPropagation();
      openCanonicalProfile("replace");
    };

    document.addEventListener("click", handleProfileReopen, true);
    return () => document.removeEventListener("click", handleProfileReopen, true);
  }, []);

  useEffect(() => {
    if (servicesPath && view === "profile") {
      openCanonicalProfile("replace");
      return undefined;
    }
    return undefined;
  }, [servicesPath, view]);

  useEffect(() => {
    if (!servicesPath) {
      setTarget(null);
      setWorkspaceLinkTarget(null);
      return undefined;
    }

    const resolve = () => setTarget(document.querySelector<HTMLElement>(".bottom-nav"));
    resolve();
    const observer = new MutationObserver(resolve);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [servicesPath]);

  useEffect(() => {
    if (!target) {
      setWorkspaceLinkTarget(null);
      return undefined;
    }
    const workspaceLink = target.querySelector<HTMLAnchorElement>('a[href="/beauty/workspace"], a[href="/services/beauty/master"]');
    setWorkspaceLinkTarget(workspaceLink);
    target.style.gridTemplateColumns = `repeat(${servicesBottomNavigationCount(userRole)}, minmax(0, 1fr))`;
    if (workspaceLink) {
      workspaceLink.href = "/beauty/workspace";
      workspaceLink.hidden = !showWorkspace;
      workspaceLink.style.order = "5";
    }

    return () => {
      target.style.gridTemplateColumns = "";
      setWorkspaceLinkTarget(null);
      if (workspaceLink) {
        workspaceLink.hidden = false;
        workspaceLink.style.order = "";
      }
    };
  }, [showWorkspace, target, userRole]);

  if (masterWorkspacePath) return <BeautyMasterWorkspacePage />;
  if (!servicesPath || !target) return null;
  const profileLabel = clientNavigationLabels[language][4];

  return <>
    {createPortal(
      <button
        className={view === "profile" ? "active" : ""}
        data-services-profile-tab
        onClick={() => openCanonicalProfile("push")}
        style={{ order: 4 }}
        type="button"
      >
        <CircleUserRound />
        <span>{profileLabel}</span>
      </button>,
      target,
    )}
    {workspaceLinkTarget && pendingCount > 0 && createPortal(
      <span className="notification-badge services-workspace-notification-badge" aria-hidden="true">
        {pendingCount > 9 ? "9+" : pendingCount}
      </span>,
      workspaceLinkTarget,
    )}
  </>;
}
