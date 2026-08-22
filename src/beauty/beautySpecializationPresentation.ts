import type { Language } from "../types";
import {
  primaryBeautySpecialization,
  type BeautyServiceSpecialization,
  type BeautyWorkspace,
} from "./beautySetupModel";

type BeautySpecializationPresentation = {
  publicLabel: "Nails" | "Barbering";
  workspaceTitle: Record<Language, string>;
  defaultArtwork: string;
};

export const beautySpecializationPresentation = {
  nails: {
    publicLabel: "Nails",
    workspaceTitle: {
      ru: "Кабинет мастера",
      uk: "Кабінет майстра",
      cs: "Kabinet profesionála",
      en: "Professional workspace",
    },
    defaultArtwork: "/services/share-6x5/s-01-manicure.webp",
  },
  barber: {
    publicLabel: "Barbering",
    workspaceTitle: {
      ru: "Кабинет барбера",
      uk: "Кабінет барбера",
      cs: "Barber kabinet",
      en: "Barber workspace",
    },
    defaultArtwork: "/services/share-6x5/s-02-barber.webp",
  },
} satisfies Record<BeautyServiceSpecialization, BeautySpecializationPresentation>;

export const resolveBeautySpecializationPresentation = (
  workspace: Pick<BeautyWorkspace, "service" | "services">,
) => {
  const specialization = primaryBeautySpecialization(workspace);
  return { specialization, ...beautySpecializationPresentation[specialization] };
};
