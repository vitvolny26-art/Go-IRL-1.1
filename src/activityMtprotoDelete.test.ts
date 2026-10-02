import { describe, expect, it, vi } from "vitest";
// Load the Deno helper without adding its .ts imports to the browser TS build.
const cleanupModule = "../scripts/activity-mtproto-delete-core.ts";
const { activityCleanupTarget, deleteActivityPublication } = await import(cleanupModule);

const activityId = "e8203b66-4afe-4826-b552-8b50d63293d8";
const now = Date.parse("2026-10-02T09:00:00Z");
const activity = { id: activityId, city_id: "olomouc", updated_at: "2026-09-25T13:57:15.574Z", metadata: {
  retained: "unchanged", cityTelegramPublication: { activityId, messageId: 92, chatId: -1004451765209, active: true, messageThreadId: 5, unpinAt: "2026-09-26T17:00:00Z" },
} };
const args = () => ({ activity, activityId, messageId: 92, now });

describe("exact Activity MTProto cleanup", () => {
  it("verifies physical absence before metadata reconciliation", async () => {
    const calls: string[] = [];
    const readMessage = vi.fn().mockResolvedValueOnce({ id: 92 }).mockResolvedValueOnce(null);
    const reconcile = vi.fn(async (metadata: Record<string, unknown>) => { expect(metadata.retained).toBe("unchanged"); calls.push("reconcile"); });
    const result = await deleteActivityPublication({ ...args(), readMessage,
      deleteMessage: async () => { calls.push("delete"); }, reconcile });
    expect(result).toEqual({ state: "deleted", messageId: 92, chatId: -1004451765209 });
    expect(calls).toEqual(["delete", "reconcile"]);
    expect(reconcile.mock.calls[0][0]).toMatchObject({ retained: "unchanged", cityTelegramPublication: { messageId: 92, messageThreadId: 5, active: false, deletedAt: new Date(now).toISOString() } });
  });
  it("does not write metadata when deletion is not confirmed", async () => {
    const reconcile = vi.fn();
    await expect(deleteActivityPublication({ ...args(), readMessage: async () => ({ id: 92 }), deleteMessage: async () => {}, reconcile })).rejects.toThrow("physical_delete_unconfirmed");
    expect(reconcile).not.toHaveBeenCalled();
  });
  it("does not mutate Telegram when the requested message changed", async () => {
    const readMessage = vi.fn();
    await expect(deleteActivityPublication({ ...args(), messageId: 93, readMessage, deleteMessage: vi.fn(), reconcile: vi.fn() })).rejects.toThrow("target_mismatch");
    expect(readMessage).not.toHaveBeenCalled();
  });
  it("rejects a different city chat and an ongoing event", () => {
    expect(() => activityCleanupTarget({ ...activity, city_id: "praha" }, activityId, 92, now)).toThrow("target_mismatch");
    expect(() => activityCleanupTarget(activity, activityId, 92, Date.parse("2026-09-26T16:00:00Z"))).toThrow("not_ended");
  });
  it("reconciles already-absent messages without deleting again", async () => {
    const deleteMessage = vi.fn();
    const result = await deleteActivityPublication({ ...args(), readMessage: async () => null, deleteMessage, reconcile: vi.fn() });
    expect(result.state).toBe("already_absent");
    expect(deleteMessage).not.toHaveBeenCalled();
  });
});
