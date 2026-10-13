import type { SupabaseClient } from "@supabase/supabase-js";
import type { NamedTeam, NamedTeamMembership } from "./namedTeams";

type TeamRow = {
  id: string; owner_user_key: string; name: string; visibility: "private";
  created_at: string; updated_at: string;
};
type MembershipRow = {
  team_id: string; user_key: string; role: NamedTeamMembership["role"];
  status: NamedTeamMembership["status"]; updated_at: string;
};

const mapTeam = (row: TeamRow): NamedTeam => ({
  id: row.id, ownerUserKey: row.owner_user_key, name: row.name,
  visibility: row.visibility, createdAt: row.created_at, updatedAt: row.updated_at,
});
const mapMembership = (row: MembershipRow): NamedTeamMembership => ({
  teamId: row.team_id, userKey: row.user_key, role: row.role,
  status: row.status, updatedAt: row.updated_at,
});

/**
 * Owner management uses a security-definer RPC. Authenticated RLS and owner-seeding
 * trigger enforce ownership. No client-side membership or role writes.
 */
export class SupabaseNamedTeamsRepository {
  constructor(private readonly client: SupabaseClient, private readonly actorUserKey: string) {
    if (!actorUserKey.trim()) throw new Error("named_team_actor_required");
  }

  async listTeams(): Promise<NamedTeam[]> {
    const { data, error } = await this.client.from("named_teams")
      .select("id,owner_user_key,name,visibility,created_at,updated_at");
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("invalid_named_team_rows");
    return (data as TeamRow[]).map(mapTeam);
  }

  async listOwnMemberships(): Promise<NamedTeamMembership[]> {
    const { data, error } = await this.client.from("named_team_memberships")
      .select("team_id,user_key,role,status,updated_at")
      .eq("user_key", this.actorUserKey);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("invalid_named_team_membership_rows");
    return (data as MembershipRow[]).map(mapMembership);
  }

  async membershipAction(teamId: string, action: "invite" | "accept" | "decline" | "leave" | "remove", targetUserKey?: string): Promise<void> {
    if (!teamId.trim()) throw new Error("named_team_id_required");
    if ((action === "invite" || action === "remove") && !targetUserKey?.trim()) {
      throw new Error("named_team_target_required");
    }
    const { error } = await this.client.rpc("go_irl_named_team_membership_action", {
      p_team_id: teamId,
      p_action: action,
      p_target_user_key: targetUserKey?.trim() || null,
    });
    if (error) throw error;
  }

  async manageTeam(teamId: string, action: "rename" | "delete", name?: string): Promise<void> {
    if (!teamId.trim()) throw new Error("named_team_id_required");
    const trimmed = name?.trim();
    if (action === "rename" && (!trimmed || trimmed.length > 80)) {
      throw new Error("invalid_named_team_name");
    }
    const { error } = await this.client.rpc("go_irl_named_team_manage", {
      p_team_id: teamId,
      p_action: action,
      p_name: action === "rename" ? trimmed : null,
    });
    if (error) throw error;
  }

  async createTeam(name: string): Promise<NamedTeam> {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) throw new Error("invalid_named_team_name");
    const { data, error } = await this.client.from("named_teams")
      .insert({ name: trimmed, owner_user_key: this.actorUserKey, visibility: "private" })
      .select("id,owner_user_key,name,visibility,created_at,updated_at")
      .single();
    if (error) throw error;
    if (!data || data.owner_user_key !== this.actorUserKey) throw new Error("invalid_named_team_create_response");
    return mapTeam(data as TeamRow);
  }
}
