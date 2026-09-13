import { describe, expect, it, vi } from "vitest";
import {
  messagingWorkerStageFailureCode,
  runMessagingWorkerStages,
} from "./messagingWorkerStages";

describe("messaging worker stage isolation", () => {
  it("continues notifications when reminder processing fails", async () => {
    const runNotifications = vi.fn().mockResolvedValue({ claimed: 19, sent: 11 });
    const result = await runMessagingWorkerStages(
      vi.fn().mockRejectedValue(new Error("reminder_claim_failed:unknown:Gateway Timeout")),
      runNotifications,
    );

    expect(runNotifications).toHaveBeenCalledTimes(1);
    expect(result.reminders).toMatchObject({
      ok: false,
      error: new Error("reminder_claim_failed:unknown:Gateway Timeout"),
    });
    expect(result.notifications).toEqual({
      ok: true,
      value: { claimed: 19, sent: 11 },
    });
    expect(messagingWorkerStageFailureCode(result)).toBe(
      "messaging_worker_stage_failed:reminders=reminder_claim_failed:unknown:Gateway Timeout",
    );
  });

  it("runs stages sequentially and reports both failures", async () => {
    const order: string[] = [];
    const result = await runMessagingWorkerStages(
      async () => {
        order.push("reminders");
        throw new Error("reminder_failed");
      },
      async () => {
        order.push("notifications");
        throw new Error("notification_failed");
      },
    );

    expect(order).toEqual(["reminders", "notifications"]);
    expect(messagingWorkerStageFailureCode(result)).toBe(
      "messaging_worker_stage_failed:reminders=reminder_failed|notifications=notification_failed",
    );
  });
});
