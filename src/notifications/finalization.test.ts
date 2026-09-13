import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ rpc: rpcMock })),
}));

import { EventNotificationRepository } from "./repository.js";
import { SupabaseReminderRepository } from "../reminders/supabase-repository.js";

describe("notification and reminder finalization", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("retries a code-less notification finish RPC once without redispatching", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { code: "", message: "fetch failed" } })
      .mockResolvedValueOnce({ data: null, error: null });
    const repository = new EventNotificationRepository(
      "https://example.supabase.co",
      "service-role",
      "https://go-irl.fun",
      ["telegram"],
    );

    await expect(repository.finish("n1", {
      status: "sent",
      providerMessageId: "42",
    })).resolves.toBeUndefined();

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenLastCalledWith("go_irl_finish_event_notification", expect.objectContaining({
      p_notification_id: "n1",
      p_outcome: "sent",
      p_provider_message_id: "42",
    }));
  });

  it("preserves the PostgREST message when notification finalization keeps failing without a code", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "", message: "TypeError: fetch failed" },
    });
    const repository = new EventNotificationRepository(
      "https://example.supabase.co",
      "service-role",
      "https://go-irl.fun",
      ["telegram"],
    );

    await expect(repository.finish("n1", { status: "sent" }))
      .rejects.toThrow("notification_finish_failed:unknown:TypeError: fetch failed");
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });

  it("retries a code-less reminder finish RPC once and keeps diagnostics", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { code: null, message: "fetch failed" } })
      .mockResolvedValueOnce({ data: null, error: null });
    const repository = new SupabaseReminderRepository({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      publicOrigin: "https://go-irl.fun",
      providers: ["telegram"],
    });

    await expect(repository.finish("r1", { status: "sent" })).resolves.toBeUndefined();
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock).toHaveBeenLastCalledWith("go_irl_finish_event_reminder", expect.objectContaining({
      p_reminder_id: "r1",
      p_outcome: "sent",
    }));
  });
});
