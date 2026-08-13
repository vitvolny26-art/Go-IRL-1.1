import { describe, expect, it, vi } from "vitest";

import { AccountRequestTransportError, submitAccountRequest } from "./accountRequest";

describe("account request boundary", () => {
  it("reports unavailable when no backend transport exists", async () => {
    const result = await submitAccountRequest("data_export", {
      correlationId: "corr-export",
    });

    expect(result).toEqual({
      status: "unavailable",
      kind: "data_export",
      correlationId: "corr-export",
      errorCode: "transport_unavailable",
    });
  });

  it("submits an account deletion request through an explicit transport", async () => {
    const transport = vi.fn(async () => ({ requestId: "request-123" }));

    const result = await submitAccountRequest("account_deletion", {
      correlationId: "corr-delete",
      transport,
    });

    expect(transport).toHaveBeenCalledWith({
      kind: "account_deletion",
      correlationId: "corr-delete",
    });
    expect(result).toEqual({
      status: "submitted",
      kind: "account_deletion",
      correlationId: "corr-delete",
      requestId: "request-123",
    });
  });

  it("generates and forwards a correlation id when none is provided", async () => {
    const transport = vi.fn(async () => ({ requestId: "request-generated" }));

    const result = await submitAccountRequest("data_export", { transport });

    expect(result.status).toBe("submitted");
    expect(result.correlationId).toBeTruthy();
    expect(transport).toHaveBeenCalledWith({
      kind: "data_export",
      correlationId: result.correlationId,
    });
  });

  it("rejects a successful transport response without a request id", async () => {
    const result = await submitAccountRequest("data_export", {
      correlationId: "corr-invalid",
      transport: async () => ({ requestId: "   " }),
    });

    expect(result).toEqual({
      status: "failed",
      kind: "data_export",
      correlationId: "corr-invalid",
      errorCode: "invalid_response",
    });
  });

  it("maps the safe self-delete auth resolution diagnostic without exposing provider subjects", async () => {
    const result = await submitAccountRequest("account_deletion", {
      correlationId: "corr-auth-resolution",
      transport: async () => {
        throw new AccountRequestTransportError(
          "account_deletion_auth_resolution_failed",
          500,
          "account_deletion_auth_resolution_failed",
        );
      },
    });

    expect(result).toEqual({
      status: "failed",
      kind: "account_deletion",
      correlationId: "corr-auth-resolution",
      errorCode: "auth_resolution_failed",
    });
  });

  it("reports transport failures without claiming submission", async () => {
    const result = await submitAccountRequest("account_deletion", {
      correlationId: "corr-failed",
      transport: async () => {
        throw new Error("service unavailable");
      },
    });

    expect(result).toEqual({
      status: "failed",
      kind: "account_deletion",
      correlationId: "corr-failed",
      errorCode: "request_failed",
    });
  });
});
