import type { CommunicationChannel, CommunicationRoute, ExecutableCommunicationRoute } from "./contracts.js";

export type CommunicationAdapterPayload = { text: string; openUrl?: string; templateKey?: string };
export type CommunicationAdapterOutcome = { status: "sent"; providerMessageId?: string } | { status: "retry" | "failed" | "unavailable"; code: string };

export interface CommunicationRouteAdapter {
  readonly channel: CommunicationChannel;
  send(route: ExecutableCommunicationRoute, payload: CommunicationAdapterPayload): Promise<CommunicationAdapterOutcome>;
}

export const sanitizeProviderError = (channel: CommunicationChannel, error: unknown) => {
  const raw = error instanceof Error ? error.message : "unknown";
  const safe = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 48) || "unknown";
  return `${channel}_${safe}`;
};

export function assertExecutableRoute(route: CommunicationRoute): ExecutableCommunicationRoute {
  if (!route.destinationRef || route.readiness !== "ready" || route.consent !== "granted") {
    throw new Error("communication_route_not_executable");
  }
  if (!route.capabilities.includes("outbound") || !route.capabilities.includes("notification")) {
    throw new Error("communication_route_missing_capability");
  }
  return route as ExecutableCommunicationRoute;
}
