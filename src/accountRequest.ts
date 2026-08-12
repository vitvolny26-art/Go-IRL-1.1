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

export type AccountRequestTransport = (
  input: AccountRequestInput,
) => Promise<AccountRequestTransportResponse>;

export type AccountRequestResult =
  | {
      status: "submitted";
      kind: AccountRequestKind;
      correlationId: string;
      requestId: string;
      accountDeleted: boolean;
      cleanupPending: boolean;
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
      errorCode: "request_failed" | "invalid_response";
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
      accountDeleted: response.accountDeleted === true,
      cleanupPending: response.cleanupPending === true,
    };
  } catch {
    return {
      status: "failed",
      kind,
      correlationId,
      errorCode: "request_failed",
    };
  }
};
