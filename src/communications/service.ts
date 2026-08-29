import { communicationContractVersion, type CanonicalUserKey, type CommunicationIntent, type CommunicationKind } from "./contracts.js";

export interface CommunicationIntentOutbox {
  enqueue<Payload>(intent: CommunicationIntent<Payload>): Promise<{ status: "queued" | "duplicate"; intentKey: string }>;
}

export type SendToUserInput<Payload> = {
  userKey: CanonicalUserKey;
  kind: CommunicationKind;
  payload: Payload;
  idempotencyKey: string;
  occurredAt?: string;
};

export function createCommunicationIntent<Payload>(input: SendToUserInput<Payload>): CommunicationIntent<Payload> {
  if (!input.userKey.trim()) throw new Error("communication_user_required");
  if (!input.idempotencyKey.trim()) throw new Error("communication_idempotency_key_required");
  return {
    version: communicationContractVersion,
    intentKey: input.idempotencyKey,
    userKey: input.userKey,
    kind: input.kind,
    payload: input.payload,
    occurredAt: input.occurredAt || new Date().toISOString(),
    idempotencyKey: input.idempotencyKey,
  };
}

/** Business callers address only the canonical GO IRL user. Routing is downstream. */
export async function sendToUser<Payload>(outbox: CommunicationIntentOutbox, input: SendToUserInput<Payload>) {
  return outbox.enqueue(createCommunicationIntent(input));
}
