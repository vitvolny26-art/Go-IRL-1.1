export type OrganizerTeamRelationshipStatus = "pending" | "accepted" | "declined" | "withdrawn";
export type OrganizerTeamRelationshipSource = "favorite_organizer";
export type OrganizerTeamRelationshipDecision = "accept" | "decline";
export type OrganizerTeamRelationshipResponseResult =
  | "changed"
  | "existing"
  | "stale"
  | "not_found"
  | "invalid_transition";

export type OrganizerTeamRelationshipRecord = {
  id: string;
  organizerUserKey: string;
  memberUserKey: string;
  status: OrganizerTeamRelationshipStatus;
  source: OrganizerTeamRelationshipSource;
  requestedAt: string;
  respondedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrganizerTeamRelationshipResponse = {
  result: OrganizerTeamRelationshipResponseResult;
  organizerUserKey: string;
  memberUserKey: string;
  relationshipStatus: OrganizerTeamRelationshipStatus | null;
  updatedAt: string | null;
};

export type FavoriteOrganizerRelationshipProjection = {
  organizerUserKey: string;
  isFavorite: boolean;
  favoriteUpdatedAt: string | null;
  teamRelationshipStatus: OrganizerTeamRelationshipStatus | null;
  relationshipUpdatedAt: string | null;
  requestedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  withdrawnAt: string | null;
};

type OrganizerTeamRelationshipRow = {
  id: unknown;
  organizer_user_key: unknown;
  member_user_key: unknown;
  status: unknown;
  source: unknown;
  requested_at: unknown;
  responded_at: unknown;
  accepted_at: unknown;
  declined_at: unknown;
  withdrawn_at: unknown;
  created_at: unknown;
  updated_at: unknown;
};

const relationshipStatuses: readonly OrganizerTeamRelationshipStatus[] = [
  "pending",
  "accepted",
  "declined",
  "withdrawn",
];

const responseResults: readonly OrganizerTeamRelationshipResponseResult[] = [
  "changed",
  "existing",
  "stale",
  "not_found",
  "invalid_transition",
];

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object";
const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

export const isOrganizerTeamRelationshipStatus = (value: unknown): value is OrganizerTeamRelationshipStatus =>
  typeof value === "string" && relationshipStatuses.includes(value as OrganizerTeamRelationshipStatus);

export const isOrganizerTeamRelationshipResponseResult = (value: unknown): value is OrganizerTeamRelationshipResponseResult =>
  typeof value === "string" && responseResults.includes(value as OrganizerTeamRelationshipResponseResult);

export const mapOrganizerTeamRelationshipRow = (value: unknown): OrganizerTeamRelationshipRecord => {
  if (!isRecord(value)) throw new Error("invalid_organizer_team_relationship_row");
  const row = value as OrganizerTeamRelationshipRow;

  if (
    !isNonEmptyString(row.id)
    || !isNonEmptyString(row.organizer_user_key)
    || !isNonEmptyString(row.member_user_key)
    || !isOrganizerTeamRelationshipStatus(row.status)
    || row.source !== "favorite_organizer"
    || !isNonEmptyString(row.requested_at)
    || !isNullableString(row.responded_at)
    || !isNullableString(row.accepted_at)
    || !isNullableString(row.declined_at)
    || !isNullableString(row.withdrawn_at)
    || !isNonEmptyString(row.created_at)
    || !isNonEmptyString(row.updated_at)
  ) {
    throw new Error("invalid_organizer_team_relationship_row");
  }

  return {
    id: row.id,
    organizerUserKey: row.organizer_user_key,
    memberUserKey: row.member_user_key,
    status: row.status,
    source: row.source,
    requestedAt: row.requested_at,
    respondedAt: row.responded_at,
    acceptedAt: row.accepted_at,
    declinedAt: row.declined_at,
    withdrawnAt: row.withdrawn_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const timestamp = (value: string) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const newestRelationshipFirst = (left: OrganizerTeamRelationshipRecord, right: OrganizerTeamRelationshipRecord) => {
  const leftActivity = Math.max(timestamp(left.requestedAt), timestamp(left.updatedAt));
  const rightActivity = Math.max(timestamp(right.requestedAt), timestamp(right.updatedAt));
  return rightActivity - leftActivity
    || timestamp(right.requestedAt) - timestamp(left.requestedAt)
    || timestamp(right.updatedAt) - timestamp(left.updatedAt)
    || left.id.localeCompare(right.id);
};

export const buildMemberOrganizerRelationships = (
  records: readonly OrganizerTeamRelationshipRecord[],
  actorUserKey: string,
) => records
  .filter((record) => record.memberUserKey === actorUserKey)
  .slice()
  .sort(newestRelationshipFirst);

export const buildOrganizerTeamRequests = (
  records: readonly OrganizerTeamRelationshipRecord[],
  actorUserKey: string,
) => records
  .filter((record) => record.organizerUserKey === actorUserKey && record.status === "pending")
  .slice()
  .sort(newestRelationshipFirst);

export const buildOrganizerAcceptedTeam = (
  records: readonly OrganizerTeamRelationshipRecord[],
  actorUserKey: string,
) => records
  .filter((record) => record.organizerUserKey === actorUserKey && record.status === "accepted")
  .slice()
  .sort(newestRelationshipFirst);

export const buildFavoriteOrganizerRelationshipProjection = (
  favorite: { organizerUserKey: string; isFavorite: boolean; updatedAt?: string | null },
  relationship: OrganizerTeamRelationshipRecord | null,
): FavoriteOrganizerRelationshipProjection => {
  if (relationship && relationship.organizerUserKey !== favorite.organizerUserKey) {
    throw new Error("favorite_relationship_organizer_mismatch");
  }

  return {
    organizerUserKey: favorite.organizerUserKey,
    isFavorite: favorite.isFavorite,
    favoriteUpdatedAt: favorite.updatedAt ?? null,
    teamRelationshipStatus: relationship?.status ?? null,
    relationshipUpdatedAt: relationship?.updatedAt ?? null,
    requestedAt: relationship?.requestedAt ?? null,
    acceptedAt: relationship?.acceptedAt ?? null,
    declinedAt: relationship?.declinedAt ?? null,
    withdrawnAt: relationship?.withdrawnAt ?? null,
  };
};
