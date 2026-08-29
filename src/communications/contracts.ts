export const communicationContractVersion = 1 as const;

export type CanonicalUserKey = string;
export type CommunicationChannel = "in_app" | "email" | "telegram" | "messenger" | "instagram" | "whatsapp";
export type CommunicationKind = "onboarding" | "contract" | "booking" | "reminder" | "review" | "service" | "security";
export type CommunicationReadiness = "identity_only" | "candidate" | "ready" | "disabled" | "revoked";
export type CommunicationCapability = "contact" | "inbound" | "outbound" | "notification";
export type CommunicationConsent = "unknown" | "granted" | "denied" | "revoked";
export type CommunicationHealth = "unknown" | "healthy" | "degraded" | "unhealthy";
export type CommunicationPreferenceState = "unconfigured" | "configured";

export type CommunicationIntent<Payload = unknown> = {
  version: typeof communicationContractVersion;
  intentKey: string;
  userKey: CanonicalUserKey;
  kind: CommunicationKind;
  payload: Payload;
  occurredAt: string;
  idempotencyKey: string;
};

export type CommunicationRoute = {
  id: string;
  userKey: CanonicalUserKey;
  channel: CommunicationChannel;
  providerIdentityId?: string | null;
  /** Opaque server-side reference. Never a canonical identity and never exposed to browser callers. */
  destinationRef?: string | null;
  readiness: CommunicationReadiness;
  capabilities: CommunicationCapability[];
  consent: CommunicationConsent;
  health: CommunicationHealth;
  identityObservedAt?: string | null;
  readinessCheckedAt?: string | null;
  healthCheckedAt?: string | null;
  disabledAt?: string | null;
};

export type CommunicationPreference = {
  userKey: CanonicalUserKey;
  state: CommunicationPreferenceState;
  primaryRouteId: string | null;
  /** Reserved for deliberate, ordered fallback. Empty means no external fallback. */
  fallbackRouteIds: string[];
  updatedAt: string;
};

export type ExecutableCommunicationRoute = CommunicationRoute & {
  readiness: "ready";
  consent: "granted";
  destinationRef: string;
};

export type CommunicationRouteResolution =
  | { outcome: "executable"; route: ExecutableCommunicationRoute }
  | { outcome: "no_route"; reason: "unconfigured" | "route_missing" }
  | { outcome: "needs_attention"; reason: "disabled_or_revoked" | "missing_capability" | "missing_consent" | "stale_or_unhealthy" | "destination_unavailable"; routeId: string };

export type CommunicationDeliveryResult = {
  intentKey: string;
  userKey: CanonicalUserKey;
  selectedRouteId?: string;
  adapter?: CommunicationChannel;
  outcome: "sent" | "retry" | "failed" | "no_route" | "needs_attention";
  occurredAt: string;
  sanitizedCode?: string;
};

export interface CommunicationRouteResolver {
  resolveCommunicationRoute(userKey: CanonicalUserKey, kind: CommunicationKind): Promise<CommunicationRouteResolution>;
}
