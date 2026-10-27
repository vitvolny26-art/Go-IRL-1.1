import {
  isProfileRoleId,
  profileRoleIds,
  type ProfileRoleId,
} from "./profileRoleCatalog";
import {
  isProfileRoleInterestLevelId,
  type ProfileRoleInterestLevelId,
} from "./profileRoleInterestLevels";

export type ProfileRoleInterestSelection = Readonly<
  Partial<Record<ProfileRoleId, ProfileRoleInterestLevelId>>
>;

export type ProfileRoleInterestRow = Readonly<{
  role_id: string;
  interest_level: string;
}>;

export type ProfileRoleInterestWriteRow = Readonly<{
  role_id: ProfileRoleId;
  interest_level: ProfileRoleInterestLevelId;
}>;

export const maxProfileRoleInterests = profileRoleIds.length;

export const parseProfileRoleInterestRows = (
  rows: readonly ProfileRoleInterestRow[],
): ProfileRoleInterestSelection | null => {
  if (rows.length > maxProfileRoleInterests) return null;

  const selection: Partial<Record<ProfileRoleId, ProfileRoleInterestLevelId>> = {};

  for (const row of rows) {
    if (!isProfileRoleId(row.role_id) || !isProfileRoleInterestLevelId(row.interest_level)) {
      return null;
    }

    if (selection[row.role_id]) return null;
    selection[row.role_id] = row.interest_level;
  }

  return selection;
};

export const serializeProfileRoleInterestSelection = (
  selection: ProfileRoleInterestSelection,
): readonly ProfileRoleInterestWriteRow[] =>
  profileRoleIds.flatMap((roleId) => {
    const interestLevel = selection[roleId];
    return interestLevel
      ? [{ role_id: roleId, interest_level: interestLevel }]
      : [];
  });

export const setProfileRoleInterest = (
  selection: ProfileRoleInterestSelection,
  roleId: ProfileRoleId,
  interestLevel: ProfileRoleInterestLevelId | null,
): ProfileRoleInterestSelection => {
  const next = { ...selection };

  if (interestLevel === null) {
    delete next[roleId];
  } else {
    next[roleId] = interestLevel;
  }

  return next;
};
