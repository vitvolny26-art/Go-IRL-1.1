import { getTelegramInitData } from "../telegram";
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

type AdminResponse = {
  error?: string;
  invitation?: CreatedRoleInvitation;
  roleAssignments?: RawRoleAssignment[];
  roleDemotion?: RawRoleDemotionResult;
};

const roleInvitationPattern = /^ri_[A-Za-z0-9_-]{43}$/;
const userKeyPattern = /^telegram:[0-9]+$/;

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
  dependencies: {
    fetcher?: typeof fetch;
    initData?: string;
    publishableKey?: string;
    supabaseUrl?: string;
  } = {},
) => {
  const fetcher = dependencies.fetcher || fetch;
  const initData = dependencies.initData ?? getTelegramInitData();
  const supabaseUrl = dependencies.supabaseUrl ?? import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = dependencies.publishableKey ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!initData) throw new Error("telegram_init_data_required");
  if (!supabaseUrl || !publishableKey) throw new Error("trusted_auth_env_missing");

  const response = await fetcher(`${supabaseUrl}/functions/v1/verifyTelegramInitData`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: publishableKey },
    body: JSON.stringify({ ...body, initData }),
  });
  const payload = await response.json() as AdminResponse;
  if (!response.ok) throw new Error(payload.error || payload.roleDemotion?.status || "admin_action_failed");
  return payload;
};

export const requestRoleInvitation = async (
  targetRole: RoleInvitationTargetRole,
  dependencies: Parameters<typeof trustedAdminRequest>[1] = {},
) => {
  const payload = await trustedAdminRequest({ action: "create_role_invitation", targetRole }, dependencies);
  if (!payload.invitation || !isRoleInvitationStartParam(payload.invitation.startParam)) {
    throw new Error(payload.error || "role_invitation_creation_failed");
  }
  return payload.invitation;
};

export const requestRoleAssignments = async (
  dependencies: Parameters<typeof trustedAdminRequest>[1] = {},
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
  dependencies: Parameters<typeof trustedAdminRequest>[1] = {},
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
