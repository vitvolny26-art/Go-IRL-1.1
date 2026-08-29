import type {
  CommunicationKind,
  CommunicationPreference,
  CommunicationRoute,
  CommunicationRouteResolution,
} from "./contracts.js";

const requiredCapabilities = () => ["outbound", "notification"] as const;

export function resolveCommunicationRoute(
  preference: CommunicationPreference | null,
  routes: readonly CommunicationRoute[],
  kind: CommunicationKind,
): CommunicationRouteResolution {
  if (!preference || preference.state === "unconfigured" || !preference.primaryRouteId) {
    return { outcome: "no_route", reason: "unconfigured" };
  }
  const route = routes.find((candidate) => candidate.id === preference.primaryRouteId && candidate.userKey === preference.userKey);
  if (!route) return { outcome: "no_route", reason: "route_missing" };
  if (route.readiness === "disabled" || route.readiness === "revoked") {
    return { outcome: "needs_attention", reason: "disabled_or_revoked", routeId: route.id };
  }
  if (route.readiness !== "ready") {
    return { outcome: "needs_attention", reason: "destination_unavailable", routeId: route.id };
  }
  void kind;
  if (!requiredCapabilities().every((capability) => route.capabilities.includes(capability))) {
    return { outcome: "needs_attention", reason: "missing_capability", routeId: route.id };
  }
  if (route.consent !== "granted") {
    return { outcome: "needs_attention", reason: "missing_consent", routeId: route.id };
  }
  if (route.health === "degraded" || route.health === "unhealthy") {
    return { outcome: "needs_attention", reason: "stale_or_unhealthy", routeId: route.id };
  }
  if (!route.destinationRef) {
    return { outcome: "needs_attention", reason: "destination_unavailable", routeId: route.id };
  }
  return { outcome: "executable", route: { ...route, readiness: "ready", consent: "granted", destinationRef: route.destinationRef } };
}
