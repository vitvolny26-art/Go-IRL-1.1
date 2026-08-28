import { getTrustedAccessToken } from "../authSession";
import type { UserRole } from "../types";

export type RoleInvitationTargetRole = Extract<UserRole, "organizer" | "professional" | "admin">;
export type ElevatedRole = Extract<UserRole, "organizer" | "professional" | "moderator" | "admin" | "superadmin">;

export type CreatedRoleInvitation = {
  id: string;
  startParam: string;
  targetRole: RoleInvitationTargetRole;
  expiresAt: string;
};

export type RoleAssignment = {
  userKey: string;
  telegramId: number | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  role: ElevatedRole;
  updatedAt: string;
};

export type RoleDemotionStatus = "updated" | "invalid" | "not_found" | "role_conflict";
export type RoleDemotionResult = {
  status: RoleDemotionStatus;
  previousRole: string | null;
  currentRole: string | null;
};

export type ActivityOrganizerReassignmentResult = {
  status: "updated" | "unchanged";
  activityId: string;
  previousOrganizerKey: string;
  currentOrganizerKey: string;
  currentOrganizer: string;
};

type RawRoleAssignment = {
  user_key: string;
  telegram_id: number | null;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  role: ElevatedRole;
  updated_at: string;
};

type RawRoleDemotionResult = {
  status: RoleDemotionStatus;
  previous_role: string | null;
  current_role: string | null;
};

type RawActivityOrganizerReassignmentResult = {
  status: "updated" | "unchanged";
  activity_id: string;
  previous_organizer_key: string;
  current_organizer_key: string;
  current_organizer: string;
};

type AdminResponse = {
  error?: string;
  user?: { role?: string };
  invitation?: CreatedRoleInvitation;
  roleAssignments?: RawRoleAssignment[];
  roleDemotion?: RawRoleDemotionResult;
  activityOrganizerReassignment?: RawActivityOrganizerReassignmentResult;
};

type TrustedAdminRequestDependencies = {
  accessToken?: string | null;
  endpoint?: string;
  fetcher?: typeof fetch;
  getAccessToken?: () => Promise<string | null>;
};

const roleInvitationPattern = /^ri_[A-Za-z0-9_-]{43}$/;
const userKeyPattern = /^telegram:[0-9]+$/;
const activityIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getRoleDemotionErrorMessage = (error: unknown) => {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "role_conflict":
      return "Роль уже изменилась. Обновите список.";
    case "not_found":
      return "Пользователь больше не найден. Обновите список.";
    case "invalid":
    case "invalid_target_user_key":
      return "Некорректная запись пользователя. Обновите список.";
    case "access_denied":
      return "Доступ администратора больше не подтверждён. Откройте админ-панель заново.";
    default:
      return "Не удалось разжаловать пользователя.";
  }
};

export const isRoleInvitationStartParam = (value: unknown) =>
  typeof value === "string" && roleInvitationPattern.test(value.trim());

export const buildRoleInvitationUrl = (startParam: string, botUsername: string, appName = "") => {
  if (!isRoleInvitationStartParam(startParam)) return null;
  const bot = botUsername.trim().replace(/^@/, "");
  if (!bot) return null;
  const appPath = appName.trim().replace(/^\/+|\/+$/g, "");
  const path = appPath ? `/${appPath}` : "";
  return `https://t.me/${bot}${path}?startapp=${encodeURIComponent(startParam.trim())}`;
};

const trustedAdminRequest = async (
  body: Record<string, unknown>,
  dependencies: TrustedAdminRequestDependencies = {},
) => {
  const fetcher = dependencies.fetcher || fetch;
  const getAccessToken = dependencies.getAccessToken || getTrustedAccessToken;
  const accessToken = dependencies.accessToken ?? await getAccessToken();
  if (!accessToken) throw new Error("trusted_session_required");

  const response = await fetcher(dependencies.endpoint || "/api/admin/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json() as AdminResponse;
  if (!response.ok) throw new Error(payload.error || payload.roleDemotion?.status || "admin_action_failed");
  return payload;
};

export const requestRoleInvitation = async (
  targetRole: RoleInvitationTargetRole,
  dependencies: TrustedAdminRequestDependencies = {},
) => {
  const payload = await trustedAdminRequest({ action: "create_role_invitation", targetRole }, dependencies);
  if (!payload.invitation || !isRoleInvitationStartParam(payload.invitation.startParam)) {
    throw new Error(payload.error || "role_invitation_creation_failed");
  }
  return payload.invitation;
};

export const requestRoleAssignments = async (
  dependencies: TrustedAdminRequestDependencies = {},
): Promise<RoleAssignment[]> => {
  const payload = await trustedAdminRequest({ action: "list_role_assignments" }, dependencies);
  return (payload.roleAssignments || []).map((row) => ({
    userKey: row.user_key,
    telegramId: row.telegram_id,
    firstName: row.first_name,
    lastName: row.last_name,
    username: row.username,
    role: row.role,
    updatedAt: row.updated_at,
  }));
};

export const requestRoleDemotion = async (
  targetUserKey: string,
  dependencies: TrustedAdminRequestDependencies = {},
): Promise<RoleDemotionResult> => {
  const normalizedTargetUserKey = targetUserKey.trim();
  if (!userKeyPattern.test(normalizedTargetUserKey)) throw new Error("invalid_target_user_key");
  const payload = await trustedAdminRequest({ action: "demote_role", targetUserKey: normalizedTargetUserKey }, dependencies);
  if (!payload.roleDemotion) throw new Error(payload.error || "role_demotion_failed");
  return {
    status: payload.roleDemotion.status,
    previousRole: payload.roleDemotion.previous_role,
    currentRole: payload.roleDemotion.current_role,
  };
};

export const requestCurrentAdminRole = async (
  dependencies: TrustedAdminRequestDependencies = {},
): Promise<string> => {
  const payload = await trustedAdminRequest({ action: "session" }, dependencies);
  const role = payload.user?.role;
  if (typeof role !== "string" || !role) throw new Error(payload.error || "admin_role_unavailable");
  return role;
};

export const requestActivityOrganizerReassignment = async (
  activityId: string,
  targetUserKey: string,
  dependencies: TrustedAdminRequestDependencies = {},
): Promise<ActivityOrganizerReassignmentResult> => {
  const normalizedActivityId = activityId.trim();
  const normalizedTargetUserKey = targetUserKey.trim();
  if (!activityIdPattern.test(normalizedActivityId)) throw new Error("invalid_activity_id");
  if (!userKeyPattern.test(normalizedTargetUserKey)) throw new Error("invalid_target_user_key");

  const payload = await trustedAdminRequest({
    action: "reassign_activity_organizer",
    activityId: normalizedActivityId,
    targetUserKey: normalizedTargetUserKey,
  }, dependencies);
  const result = payload.activityOrganizerReassignment;
  if (!result) throw new Error(payload.error || "activity_organizer_reassignment_failed");
  return {
    status: result.status,
    activityId: result.activity_id,
    previousOrganizerKey: result.previous_organizer_key,
    currentOrganizerKey: result.current_organizer_key,
    currentOrganizer: result.current_organizer,
  };
};
