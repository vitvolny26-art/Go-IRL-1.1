import { getCurrentAuthSession } from "../authSession.js";
import { supabase } from "../supabase.js";
import type {
  CommunicationChannel,
  CommunicationConsent,
  CommunicationHealth,
  CommunicationPreference,
  CommunicationReadiness,
  CommunicationRoute,
} from "./contracts.js";

type SettingsRow = {
  route_id: string | null;
  channel: CommunicationChannel | null;
  provider_identity_id: string | null;
  readiness: CommunicationReadiness | null;
  capabilities: string[] | null;
  consent_state: CommunicationConsent | null;
  health_state: CommunicationHealth | null;
  identity_observed_at: string | null;
  readiness_checked_at: string | null;
  preference_state: "unconfigured" | "configured" | null;
  primary_route_id: string | null;
  fallback_route_ids: string[] | null;
  preference_updated_at: string | null;
};

export type CommunicationSettings = { routes: CommunicationRoute[]; preference: CommunicationPreference };

const requireUserKey = () => {
  const userKey = getCurrentAuthSession()?.user.userKey;
  if (!userKey) throw new Error("communication_auth_required");
  return userKey;
};

export async function loadCommunicationSettings(): Promise<CommunicationSettings> {
  const userKey = requireUserKey();
  const { data, error } = await supabase.rpc("go_irl_get_communication_settings");
  if (error) throw new Error(`communication_settings_read_failed:${error.code || "unknown"}`);
  const rows = (data || []) as SettingsRow[];
  const first = rows[0];
  return {
    routes: rows.filter((row) => row.route_id && row.channel).map((row) => ({
      id: row.route_id!,
      userKey,
      channel: row.channel!,
      providerIdentityId: row.provider_identity_id,
      readiness: row.readiness || "identity_only",
      capabilities: (row.capabilities || []).filter((value): value is CommunicationRoute["capabilities"][number] => ["contact", "inbound", "outbound", "notification"].includes(value)),
      consent: row.consent_state || "unknown",
      health: row.health_state || "unknown",
      identityObservedAt: row.identity_observed_at,
      readinessCheckedAt: row.readiness_checked_at,
    })),
    preference: {
      userKey,
      state: first?.preference_state || "unconfigured",
      primaryRouteId: first?.primary_route_id || null,
      fallbackRouteIds: first?.fallback_route_ids || [],
      updatedAt: first?.preference_updated_at || new Date(0).toISOString(),
    },
  };
}

export async function saveCommunicationPreference(primaryRouteId: string | null) {
  requireUserKey();
  const { data, error } = await supabase.rpc("go_irl_set_communication_preference", {
    p_state: primaryRouteId ? "configured" : "unconfigured",
    p_primary_route_id: primaryRouteId,
  });
  if (error) throw new Error(`communication_preference_save_failed:${error.code || "unknown"}`);
  if (data !== "saved" && data !== "unchanged") throw new Error("communication_preference_invalid_response");
  return data as "saved" | "unchanged";
}
