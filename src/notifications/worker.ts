import type { EventNotificationDispatcher } from "./dispatcher.js";
import type { EventNotificationRepository } from "./repository.js";
import type { EventNotificationOutcome } from "./types.js";

const retryDelayMs = (attempt: number) =>
  Math.min(60 * 60_000, 30_000 * 2 ** Math.max(0, attempt - 1));

export async function runEventNotificationWorker(
  repository: EventNotificationRepository,
  dispatcher: EventNotificationDispatcher,
  limit = 50,
) {
  const deliveries = await repository.claim(limit);
  const summary = { claimed: deliveries.length, sent: 0, retried: 0, failed: 0, cancelled: 0 };
  for (const delivery of deliveries) {
    let outcome: EventNotificationOutcome;
    try {
      outcome = await dispatcher.send(delivery);
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 80) : "unknown";
      outcome = delivery.attemptCount >= 5
        ? { status: "failed", errorCode: code }
        : {
            status: "retry",
            errorCode: code,
            retryAt: new Date(Date.now() + retryDelayMs(delivery.attemptCount)).toISOString(),
          };
    }
    await repository.finish(delivery.id, outcome);
    summary[outcome.status === "retry" ? "retried" : outcome.status] += 1;
  }
  return summary;
}

