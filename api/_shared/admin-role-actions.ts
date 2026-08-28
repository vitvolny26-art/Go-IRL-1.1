import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "./env.js";
import type { AuthorizedAdmin } from "./admin-authorization.js";

export type AdminRoleAction = "create_role_invitation" | "list_role_assignments" | "demote_role" | "reassign_activity_organizer";
export type AdminRoleActionInput = {
  action: AdminRoleAction;
  activityId?: string;
  targetRole?: string;
  targetUserKey?: string;
};
export type AdminRoleActionResult = { status: number; payload: Record<string, unknown> };

type RoleInvitationCreateRow = { id: string; expires_at: string };
type RoleDemotionRow = { status: "updated" | "invalid" | "not_found" | "role_conflict"; previous_role: string | null; current_role: string | null };
type OrganizerTargetRow = { user_key: string; first_name: string | null; last_name: string | null; username: string | null; status: string };
type OrganizerProfileRow = { display_name: string };
type ActivityOrganizerRow = { id: string; organizer: string; organizer_key: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const userKeyPattern = /^telegram:[0-9]+$/;
const roleInvitationLifetimeSeconds = 24 * 60 * 60;
const validTargetRole = (value: unknown): value is "organizer" | "professional" | "admin" =>
  value === "organizer" || value === "professional" || value === "admin";

const base64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const createRoleInvitationToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `ri_${base64Url(bytes)}`;
};
const hashRoleInvitationToken = async (token: string) => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

export type AdminRoleActionDependencies = {
  createInvitation: (actorUserKey: string, targetRole: "organizer" | "professional" | "admin") => Promise<Record<string, unknown>>;
  listAssignments: () => Promise<unknown[]>;
  demoteRole: (actorUserKey: string, targetUserKey: string) => Promise<RoleDemotionRow>;
  reassignOrganizer: (actorUserKey: string, activityId: string, targetUserKey: string) => Promise<AdminRoleActionResult>;
};

export async function executeAdminRoleAction(
  authorization: AuthorizedAdmin,
  input: AdminRoleActionInput,
  dependencies: AdminRoleActionDependencies,
): Promise<AdminRoleActionResult> {
  if (input.action === "create_role_invitation") {
    if (!validTargetRole(input.targetRole)) return { status: 400, payload: { error: "invalid_target_role" } };
    if (input.targetRole === "admin" && authorization.role !== "superadmin") return { status: 403, payload: { error: "access_denied" } };
    return { status: 201, payload: { invitation: await dependencies.createInvitation(authorization.userKey, input.targetRole) } };
  }
  if (input.action === "list_role_assignments") {
    return { status: 200, payload: { roleAssignments: await dependencies.listAssignments() } };
  }
  if (input.action === "demote_role") {
    const targetUserKey = typeof input.targetUserKey === "string" ? input.targetUserKey.trim() : "";
    if (!userKeyPattern.test(targetUserKey)) return { status: 400, payload: { error: "invalid_target_user_key" } };
    const roleDemotion = await dependencies.demoteRole(authorization.userKey, targetUserKey);
    return { status: roleDemotion.status === "updated" ? 200 : 409, payload: { roleDemotion } };
  }
  if (authorization.role !== "superadmin") return { status: 403, payload: { error: "access_denied" } };
  const activityId = typeof input.activityId === "string" ? input.activityId.trim() : "";
  const targetUserKey = typeof input.targetUserKey === "string" ? input.targetUserKey.trim() : "";
  if (!uuidPattern.test(activityId)) return { status: 400, payload: { error: "invalid_activity_id" } };
  if (!userKeyPattern.test(targetUserKey)) return { status: 400, payload: { error: "invalid_target_user_key" } };
  return dependencies.reassignOrganizer(authorization.userKey, activityId, targetUserKey);
}

export function productionAdminRoleActionDependencies(): AdminRoleActionDependencies {
  const db = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    createInvitation: async (actorUserKey, targetRole) => {
      const token = createRoleInvitationToken();
      const expiresAt = new Date(Date.now() + roleInvitationLifetimeSeconds * 1000).toISOString();
      const result = await db.rpc("go_irl_create_role_invitation", {
        p_token_hash: await hashRoleInvitationToken(token),
        p_target_role: targetRole,
        p_created_by_user_key: actorUserKey,
        p_expires_at: expiresAt,
      }).single<RoleInvitationCreateRow>();
      if (result.error || !result.data) throw result.error || new Error("role_invitation_creation_failed");
      return { id: result.data.id, startParam: token, targetRole, expiresAt: result.data.expires_at };
    },
    listAssignments: async () => {
      const result = await db.rpc("go_irl_list_elevated_roles");
      if (result.error) throw result.error;
      return result.data || [];
    },
    demoteRole: async (actorUserKey, targetUserKey) => {
      const result = await db.rpc("go_irl_demote_role", {
        p_target_user_key: targetUserKey,
        p_actor_user_key: actorUserKey,
      }).single<RoleDemotionRow>();
      if (result.error || !result.data) throw result.error || new Error("role_demotion_failed");
      return result.data;
    },
    reassignOrganizer: async (actorUserKey, activityId, targetUserKey) => {
      const targetRoleResult = await db.from("user_roles").select("role").eq("user_key", targetUserKey).maybeSingle<{ role: string }>();
      if (targetRoleResult.error) throw targetRoleResult.error;
      if (targetRoleResult.data?.role !== "organizer") return { status: 409, payload: { error: "target_not_organizer" } };

      const targetUserResult = await db.from("app_users")
        .select("user_key,first_name,last_name,username,status").eq("user_key", targetUserKey).maybeSingle<OrganizerTargetRow>();
      if (targetUserResult.error) throw targetUserResult.error;
      if (!targetUserResult.data) return { status: 404, payload: { error: "target_user_not_found" } };
      if (targetUserResult.data.status !== "active") return { status: 409, payload: { error: "target_user_inactive" } };

      const targetProfileResult = await db.from("user_profiles").select("display_name").eq("user_key", targetUserKey).maybeSingle<OrganizerProfileRow>();
      if (targetProfileResult.error) throw targetProfileResult.error;
      const activityResult = await db.from("activities").select("id,organizer,organizer_key").eq("id", activityId).maybeSingle<ActivityOrganizerRow>();
      if (activityResult.error) throw activityResult.error;
      if (!activityResult.data) return { status: 404, payload: { error: "activity_not_found" } };

      const current = activityResult.data;
      const target = targetUserResult.data;
      const organizerName = targetProfileResult.data?.display_name?.trim()
        || [target.first_name, target.last_name].filter(Boolean).join(" ").trim()
        || (target.username ? `@${target.username}` : target.user_key);
      if (current.organizer_key === targetUserKey) return { status: 200, payload: { activityOrganizerReassignment: {
        status: "unchanged", activity_id: current.id, previous_organizer_key: current.organizer_key,
        current_organizer_key: current.organizer_key, current_organizer: current.organizer,
      } } };

      const updateResult = await db.from("activities").update({ organizer_key: targetUserKey, organizer: organizerName })
        .eq("id", activityId).eq("organizer_key", current.organizer_key).select("id,organizer,organizer_key").maybeSingle<ActivityOrganizerRow>();
      if (updateResult.error) throw updateResult.error;
      if (!updateResult.data) return { status: 409, payload: { error: "activity_organizer_conflict" } };

      const auditResult = await db.from("audit_log").insert({
        actor_user_key: actorUserKey,
        action: "activity.organizer_reassigned",
        entity_type: "activity",
        entity_id: activityId,
        metadata: { previous_organizer_key: current.organizer_key, current_organizer_key: targetUserKey },
      });
      if (auditResult.error) {
        const rollback = await db.from("activities").update({ organizer_key: current.organizer_key, organizer: current.organizer })
          .eq("id", activityId).eq("organizer_key", targetUserKey).select("id").maybeSingle<{ id: string }>();
        if (rollback.error || !rollback.data) console.error("activity_organizer_reassignment_rollback_failed", { activityId, reason: rollback.error?.message || "rollback_conflict" });
        throw auditResult.error;
      }
      return { status: 200, payload: { activityOrganizerReassignment: {
        status: "updated", activity_id: updateResult.data.id, previous_organizer_key: current.organizer_key,
        current_organizer_key: updateResult.data.organizer_key, current_organizer: updateResult.data.organizer,
      } } };
    },
  };
}
