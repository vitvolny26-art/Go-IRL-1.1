import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import {
  parseOrganizerTrustProjection,
  type OrganizerTrustProjection,
  type OrganizerTrustProjectionRow,
} from "./organizerTrustProjection";

type RpcClient = Pick<SupabaseClient, "rpc">;

const normalizeOrganizerUserKey = (value: string) => value.trim();

export const loadOrganizerTrustProjection = async (
  organizerUserKey: string,
  client: RpcClient = supabase,
): Promise<OrganizerTrustProjection | null> => {
  const normalizedKey = normalizeOrganizerUserKey(organizerUserKey);
  if (!normalizedKey) return null;

  const { data, error } = await client.rpc("go_irl_get_organizer_stats", {
    p_organizer_user_key: normalizedKey,
  });
  if (error) throw error;

  const row = (Array.isArray(data) ? data[0] : data) as OrganizerTrustProjectionRow | null | undefined;
  if (!row) return null;
  return parseOrganizerTrustProjection(row);
};

export const loadOrganizerTrustProjectionMap = async (
  organizerUserKeys: readonly string[],
  client: RpcClient = supabase,
) => {
  const keys = [...new Set(organizerUserKeys.map(normalizeOrganizerUserKey).filter(Boolean))];
  const entries = await Promise.all(keys.map(async (organizerUserKey) => {
    try {
      return [organizerUserKey, await loadOrganizerTrustProjection(organizerUserKey, client)] as const;
    } catch {
      return [organizerUserKey, null] as const;
    }
  }));
  return new Map(entries);
};
