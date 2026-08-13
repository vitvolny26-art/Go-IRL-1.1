import { createSupportCorrelationId } from "./accountLifecycle";

export type AccountRequestKind = "data_export" | "account_deletion";

export type AccountRequestInput = {
  kind: AccountRequestKind;
  correlationId: string;
};

export type AccountRequestTransportResponse = {
  requestId: string;
  accountDeleted?: boolean;
  cleanupPending?: boolean;
};

export class AccountRequestTransportError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly backendCode: string | null,
  ) {
    super(message);
    this.name = "AccountRequestTransportError";
  }
}

export type AccountRequestTransport = (
  input: AccountRequestInput,
) => Promise<AccountRequestTransportResponse>;

export type AccountRequestResult =
  | {
      status: "submitted";
      kind: AccountRequestKind;
      correlationId: string;
      requestId: string;
      accountDeleted?: boolean;
      cleanupPending?: boolean;
    }
  | {
      status: "unavailable";
      kind: AccountRequestKind;
      correlationId: string;
      errorCode: "transport_unavailable";
    }
  | {
      status: "failed";
      kind: AccountRequestKind;
      correlationId: string;
      errorCode: "request_failed" | "invalid_response" | "auth_resolution_failed";
    };

export type SubmitAccountRequestOptions = {
  transport?: AccountRequestTransport;
  correlationId?: string;
};

export const submitAccountRequest = async (
  kind: AccountRequestKind,
  options: SubmitAccountRequestOptions = {},
): Promise<AccountRequestResult> => {
  const correlationId = options.correlationId || createSupportCorrelationId();

  if (!options.transport) {
    return {
      status: "unavailable",
      kind,
      correlationId,
      errorCode: "transport_unavailable",
    };
  }

  try {
    const response = await options.transport({ kind, correlationId });
    const requestId = response.requestId.trim();

    if (!requestId) {
      return {
        status: "failed",
        kind,
        correlationId,
        errorCode: "invalid_response",
      };
    }

    return {
      status: "submitted",
      kind,
      correlationId,
      requestId,
      ...(response.accountDeleted === true ? { accountDeleted: true } : {}),
      ...(response.cleanupPending === true ? { cleanupPending: true } : {}),
    };
  } catch (error) {
    const errorCode = error instanceof AccountRequestTransportError
      && error.backendCode === "account_deletion_auth_resolution_failed"
      ? "auth_resolution_failed" as const
      : "request_failed" as const;
    return {
      status: "failed",
      kind,
      correlationId,
      errorCode,
    };
  }
};
