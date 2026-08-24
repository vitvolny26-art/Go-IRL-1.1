import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isOrganizerTeamRelationshipResponseResult,
  isOrganizerTeamRelationshipStatus,
  mapOrganizerTeamRelationshipRow,
  type OrganizerTeamRelationshipDecision,
  type OrganizerTeamRelationshipRecord,
  type OrganizerTeamRelationshipResponse,
} from "./organizerTeamRelationships";

const relationshipSelect = [
  "id",
  "organizer_user_key",
  "member_user_key",
  "status",
  "source",
  "requested_at",
  "responded_at",
  "accepted_at",
  "declined_at",
  "withdrawn_at",
  "created_at",
  "updated_at",
].join(", ");

type ResponseRow = {
  result?: unknown;
  organizer_user_key?: unknown;
  member_user_key?: unknown;
  relationship_status?: unknown;
  updated_at?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

const mapResponse = (value: unknown): OrganizerTeamRelationshipResponse => {
  if (!isRecord(value)) throw new Error("invalid_organizer_team_relationship_response");
  const row = value as ResponseRow;
  if (
    !isOrganizerTeamRelationshipResponseResult(row.result)
    || !isNonEmptyString(row.organizer_user_key)
    || !isNonEmptyString(row.member_user_key)
  ) {
    throw new Error("invalid_organizer_team_relationship_response");
  }

  const status = row.relationship_status;
  const updatedAt = row.updated_at;
  if (
    (status !== null && !isOrganizerTeamRelationshipStatus(status))
    || (updatedAt !== null && typeof updatedAt !== "string")
    || (row.result !== "not_found" && (!isOrganizerTeamRelationshipStatus(status) || typeof updatedAt !== "string"))
  ) {
    throw new Error("invalid_organizer_team_relationship_response");
  }

  return {
    result: row.result,
    organizerUserKey: row.organizer_user_key,
    memberUserKey: row.member_user_key,
    relationshipStatus: status ?? null,
    updatedAt: updatedAt ?? null,
  };
};

export interface OrganizerTeamRelationshipsRepository {
  loadForActor(): Promise<OrganizerTeamRelationshipRecord[]>;
  respond(
    memberUserKey: string,
    decision: OrganizerTeamRelationshipDecision,
    expectedUpdatedAt: string,
  ): Promise<OrganizerTeamRelationshipResponse>;
}

export class SupabaseOrganizerTeamRelationshipsRepository implements OrganizerTeamRelationshipsRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly actorUserKey: string,
  ) {
    if (!actorUserKey.trim()) throw new Error("organizer_team_relationship_actor_required");
  }

  async loadForActor(): Promise<OrganizerTeamRelationshipRecord[]> {
    const result = await this.client
      .from("organizer_team_relationships")
      .select(relationshipSelect);

    if (result.error) throw result.error;
    if (!Array.isArray(result.data)) throw new Error("invalid_organizer_team_relationship_rows");

    return result.data
      .filter((value): value is Record<string, unknown> => isRecord(value)
        && (value.organizer_user_key === this.actorUserKey || value.member_user_key === this.actorUserKey))
      .map(mapOrganizerTeamRelationshipRow);
  }

  async respond(
    memberUserKey: string,
    decision: OrganizerTeamRelationshipDecision,
    expectedUpdatedAt: string,
  ): Promise<OrganizerTeamRelationshipResponse> {
    if (!memberUserKey.trim()) throw new Error("organizer_team_relationship_member_required");
    if (!expectedUpdatedAt.trim()) throw new Error("organizer_team_relationship_expected_updated_at_required");

    const result = await this.client.rpc("go_irl_respond_team_request", {
      p_member_user_key: memberUserKey,
      p_decision: decision,
      p_expected_updated_at: expectedUpdatedAt,
    });

    if (result.error) throw result.error;
    if (!Array.isArray(result.data) || result.data.length !== 1) {
      throw new Error("invalid_organizer_team_relationship_response");
    }

    const response = mapResponse(result.data[0]);
    if (response.organizerUserKey !== this.actorUserKey || response.memberUserKey !== memberUserKey) {
      throw new Error("organizer_team_relationship_response_scope_mismatch");
    }
    return response;
  }
}

export const createOrganizerTeamRelationshipsRepository = (
  client: SupabaseClient,
  actorUserKey: string,
): OrganizerTeamRelationshipsRepository => new SupabaseOrganizerTeamRelationshipsRepository(client, actorUserKey);
