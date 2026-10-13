import type {
  ProfileRoleInterestSelection,
  ProfileRoleInterestWriteRow,
} from "./profileRoleInterestPersistence";

export const profileRoleInterestTableName = "user_profile_role_interests";
export const profileRoleInterestSaveRpcName = "go_irl_save_my_profile_role_interests";

export type ProfileRoleInterestSavePayload = Readonly<{
  p_role_interests: readonly ProfileRoleInterestWriteRow[];
}>;

export interface ProfileRoleInterestRepository {
  loadOwnRoleInterests(): Promise<ProfileRoleInterestSelection>;
  saveOwnRoleInterests(
    selection: ProfileRoleInterestSelection,
  ): Promise<ProfileRoleInterestSelection>;
}
