import { describe, expect, it } from "vitest";
import type { CommunicationPreference, CommunicationRoute } from "./contracts.js";
import { resolveCommunicationRoute } from "./resolver.js";

const preference: CommunicationPreference = { userKey: "user:1", state: "configured", primaryRouteId: "route:telegram", fallbackRouteIds: [], updatedAt: "2026-08-29T10:00:00Z" };
const ready: CommunicationRoute = { id: "route:telegram", userKey: "user:1", channel: "telegram", providerIdentityId: "identity:1", destinationRef: "server:opaque", readiness: "ready", capabilities: ["contact", "inbound", "outbound", "notification"], consent: "granted", health: "healthy" };

describe("GROOMING018 communication route resolver", () => {
  it("returns exactly the explicitly preferred executable route", () => expect(resolveCommunicationRoute(preference, [ready], "booking")).toMatchObject({ outcome: "executable", route: { id: ready.id } }));
  it("is deterministic with duplicate provider metadata", () => expect(resolveCommunicationRoute(preference, [{ ...ready, id: "duplicate" }, ready], "booking")).toMatchObject({ outcome: "executable", route: { id: ready.id } }));
  it("does not infer a linked provider while unconfigured", () => expect(resolveCommunicationRoute({ ...preference, state: "unconfigured", primaryRouteId: null }, [ready], "booking")).toEqual({ outcome: "no_route", reason: "unconfigured" }));
  it.each([
    [{ readiness: "revoked" }, "disabled_or_revoked"],
    [{ capabilities: ["contact", "inbound"] }, "missing_capability"],
    [{ consent: "unknown" }, "missing_consent"],
    [{ health: "unhealthy" }, "stale_or_unhealthy"],
    [{ destinationRef: null }, "destination_unavailable"],
  ] as const)("returns needs_attention for unsafe route %#", (changes, reason) => {
    expect(resolveCommunicationRoute(preference, [{ ...ready, ...changes } as CommunicationRoute], "reminder")).toEqual({ outcome: "needs_attention", reason, routeId: ready.id });
  });
  it("never silently uses an ordered fallback", () => {
    const fallback = { ...ready, id: "route:fallback", channel: "email" as const };
    expect(resolveCommunicationRoute({ ...preference, primaryRouteId: "missing", fallbackRouteIds: [fallback.id] }, [fallback], "contract")).toEqual({ outcome: "no_route", reason: "route_missing" });
  });
  it("keeps Facebook identity-only metadata from becoming Messenger-ready", () => {
    const messenger = { ...ready, id: "route:messenger", channel: "messenger" as const, readiness: "identity_only" as const };
    expect(resolveCommunicationRoute({ ...preference, primaryRouteId: messenger.id }, [messenger], "onboarding")).toMatchObject({ outcome: "needs_attention" });
  });
});
