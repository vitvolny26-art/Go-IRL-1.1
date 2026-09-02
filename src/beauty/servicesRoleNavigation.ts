import type { UserRole } from "../types";
import { beautyRouteAccess } from "./beautyRouteAccess";

export const canShowBeautyWorkspaceEntry = (role: UserRole) => beautyRouteAccess(role) === "allowed";

export const servicesBottomNavigationCount = (role: UserRole) => role === "professional" ? 6 : 5;
