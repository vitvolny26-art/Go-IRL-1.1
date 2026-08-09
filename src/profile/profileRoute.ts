import {
  defaultProfilePanelSection,
  isProfilePanelSection,
} from "./profilePanelNavigation";
import type { ProfilePanelSection } from "./profilePanelTypes";

export const profileSectionPaths: Record<ProfilePanelSection, string> = {
  identity: "/profile",
  preferences: "/profile/preferences",
  "my-go-irl": "/profile/activities",
  privacy: "/profile/privacy",
  security: "/profile/security",
  diagnostics: "/profile/diagnostics",
};

export const resolveProfileSectionFromPath = (pathname: string): ProfilePanelSection => {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const match = Object.entries(profileSectionPaths).find(([, path]) => path === normalized);
  return match && isProfilePanelSection(match[0]) ? match[0] : defaultProfilePanelSection;
};

export const profilePathForSection = (section: ProfilePanelSection) => profileSectionPaths[section];

export const isProfilePath = (pathname: string) => {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return normalized === "/profile" || normalized.startsWith("/profile/");
};
