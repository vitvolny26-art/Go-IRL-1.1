import type {
  ProfilePanelSection,
  ProfilePanelSectionDefinition,
  ProfilePanelState,
} from "./profilePanelTypes";

export const profilePanelSections: readonly ProfilePanelSectionDefinition[] = [
  { id: "identity", ownerOnly: true },
  { id: "preferences", ownerOnly: true },
  { id: "my-go-irl", ownerOnly: true },
  { id: "privacy", ownerOnly: true },
  { id: "security", ownerOnly: true },
  { id: "diagnostics", ownerOnly: true },
] as const;

export const defaultProfilePanelSection: ProfilePanelSection = "identity";

export const isProfilePanelSection = (value: unknown): value is ProfilePanelSection => (
  typeof value === "string" && profilePanelSections.some((section) => section.id === value)
);

export const resolveProfilePanelSection = (requested: unknown): ProfilePanelSection => (
  isProfilePanelSection(requested) ? requested : defaultProfilePanelSection
);

export const transitionProfilePanel = (
  state: ProfilePanelState,
  requested: unknown,
): ProfilePanelState => {
  const nextSection = resolveProfilePanelSection(requested);
  if (state.editing && nextSection !== defaultProfilePanelSection) return state;
  return { ...state, activeSection: nextSection };
};

export const resolveProfilePanelBackTarget = (
  activeSection: ProfilePanelSection,
): ProfilePanelSection | null => (
  activeSection === defaultProfilePanelSection ? null : defaultProfilePanelSection
);
