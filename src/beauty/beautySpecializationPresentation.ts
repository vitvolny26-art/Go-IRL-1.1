import type { BeautyWorkspace } from "./beautySetupModel";
import {
  beautyProfessionRegistry,
  resolveBeautyProfessionId,
} from "./beautyProfessionRegistry";

export const beautySpecializationPresentation = beautyProfessionRegistry;

export const resolveBeautySpecializationPresentation = (
  workspace: Pick<BeautyWorkspace, "service" | "services">,
) => {
  const specialization = resolveBeautyProfessionId(workspace);
  return { specialization, ...beautyProfessionRegistry[specialization] };
};
