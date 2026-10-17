import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseProfileRoleInterestRows,
  serializeProfileRoleInterestSelection,
  type ProfileRoleInterestRow,
  type ProfileRoleInterestSelection,
  type ProfileRoleInterestWriteRow,
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

const parseRequiredSelection = (
  rows: readonly ProfileRoleInterestRow[],
): ProfileRoleInterestSelection => {
  const parsed = parseProfileRoleInterestRows(rows);
  if (!parsed) throw new Error("profile_role_interest_invalid_response");
  return parsed;
};

export class SupabaseProfileRoleInterestRepository implements ProfileRoleInterestRepository {
  constructor(private readonly client: SupabaseClient) {}

  async loadOwnRoleInterests(): Promise<ProfileRoleInterestSelection> {
    const result = await this.client
      .from(profileRoleInterestTableName)
      .select("role_id, interest_level")
      .order("role_id", { ascending: true });

    if (result.error) throw result.error;
    return parseRequiredSelection((result.data || []) as ProfileRoleInterestRow[]);
  }

  async saveOwnRoleInterests(
    selection: ProfileRoleInterestSelection,
  ): Promise<ProfileRoleInterestSelection> {
    const payload: ProfileRoleInterestSavePayload = {
      p_role_interests: serializeProfileRoleInterestSelection(selection),
    };
    const result = await this.client.rpc(profileRoleInterestSaveRpcName, payload);

    if (result.error) throw result.error;
    return parseRequiredSelection((result.data || []) as ProfileRoleInterestRow[]);
  }
}
