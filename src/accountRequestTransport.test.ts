import { describe, expect, it, vi } from "vitest";
import { AccountRequestTransportError } from "./accountRequest";
import { createAccountRequestTransport } from "./accountRequestTransport";

describe("account request transport", () => {
  it("posts the trusted GO IRL session to the account request edge boundary", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ request: { id: "request-123" } }), {
      status: 202,
      headers: { "Content-Type": "application/json" },
    }));
    const transport = createAccountRequestTransport({
      fetchImpl: fetchImpl as typeof fetch,
      getAccessToken: async () => "trusted-token",
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "publishable-key",
    });

    await expect(transport({ kind: "data_export", correlationId: "corr-0001" }))
      .resolves.toEqual({ requestId: "request-123" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.supabase.co/functions/v1/accountRequest",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          apikey: "publishable-key",
          Authorization: "Bearer trusted-token",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ kind: "data_export", correlationId: "corr-0001" }),
      }),
    );
  });

  it("accepts an idempotent duplicate response", async () => {
    const transport = createAccountRequestTransport({
      fetchImpl: (async () => new Response(JSON.stringify({ request: { id: "request-123" }, duplicate: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
      getAccessToken: async () => "trusted-token",
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "publishable-key",
    });
    await expect(transport({ kind: "data_export", correlationId: "corr-0001" }))
      .resolves.toEqual({ requestId: "request-123" });
  });

  it("fails closed when no trusted session exists", async () => {
    const fetchImpl = vi.fn();
    const transport = createAccountRequestTransport({
      fetchImpl: fetchImpl as typeof fetch,
      getAccessToken: async () => null,
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "publishable-key",
    });
    await expect(transport({ kind: "account_deletion", correlationId: "corr-0002" }))
      .rejects.toThrow("account_request_session_required");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails closed when runtime configuration is missing", async () => {
    const transport = createAccountRequestTransport({
      getAccessToken: async () => "trusted-token",
      supabaseUrl: "",
      publishableKey: "",
    });
    await expect(transport({ kind: "data_export", correlationId: "corr-0003" }))
      .rejects.toThrow("account_request_transport_unavailable");
  });

  it("rejects backend errors without inventing a request id", async () => {
    const transport = createAccountRequestTransport({
      fetchImpl: (async () => new Response(JSON.stringify({ error: "request_failed" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
      getAccessToken: async () => "trusted-token",
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "publishable-key",
    });
    await expect(transport({ kind: "data_export", correlationId: "corr-0004" }))
      .rejects.toThrow("request_failed");
  });

  it("preserves a safe backend diagnostic code for self-delete auth resolution failures", async () => {
    const transport = createAccountRequestTransport({
      fetchImpl: (async () => new Response(JSON.stringify({ error: "account_deletion_auth_resolution_failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
      getAccessToken: async () => "trusted-token",
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "publishable-key",
    });

    await expect(transport({ kind: "account_deletion", correlationId: "corr-auth-resolution" }))
      .rejects.toMatchObject({
        name: "AccountRequestTransportError",
        status: 500,
        backendCode: "account_deletion_auth_resolution_failed",
      } satisfies Partial<AccountRequestTransportError>);
  });

  it("rejects a successful response without a durable request id", async () => {
    const transport = createAccountRequestTransport({
      fetchImpl: (async () => new Response(JSON.stringify({ request: { id: "   " } }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch,
      getAccessToken: async () => "trusted-token",
      supabaseUrl: "https://example.supabase.co",
      publishableKey: "publishable-key",
    });
    await expect(transport({ kind: "data_export", correlationId: "corr-0005" }))
      .rejects.toThrow("account_request_invalid_response");
  });
});
