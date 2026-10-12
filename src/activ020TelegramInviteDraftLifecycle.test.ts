import { describe, expect, it } from "vitest";
import { mayPublishTelegramInviteDraft, nextTelegramInviteDraftState } from "./activ020TelegramInviteDraftLifecycle";

describe("Activ020 private Telegram draft lifecycle", () => {
  it("requires prepared -> sent -> published in order", () => {
    const prepared = nextTelegramInviteDraftState("pending", "prepare");
    const sent = nextTelegramInviteDraftState(prepared, "confirm_send");
    expect(nextTelegramInviteDraftState(sent, "publish")).toBe("published");
  });

  it("prevents publishing a draft before confirmed delivery", () => {
    expect(() => nextTelegramInviteDraftState("pending", "publish")).toThrow();
    expect(() => nextTelegramInviteDraftState("prepared", "publish")).toThrow();
    expect(mayPublishTelegramInviteDraft("prepared", false, true)).toBe(false);
    expect(mayPublishTelegramInviteDraft("sent", false, false)).toBe(false);
    expect(mayPublishTelegramInviteDraft("sent", true, true)).toBe(false);
    expect(mayPublishTelegramInviteDraft("sent", false, true)).toBe(true);
  });

  it("does not publish cancelled drafts or permit replay", () => {
    expect(nextTelegramInviteDraftState("prepared", "cancel")).toBe("cancelled");
    expect(() => nextTelegramInviteDraftState("cancelled", "confirm_send")).toThrow();
    expect(() => nextTelegramInviteDraftState("published", "publish")).toThrow();
    expect(() => nextTelegramInviteDraftState("sent", "cancel")).toThrow();
  });
});
