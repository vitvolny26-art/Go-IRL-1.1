import { describe, expect, it } from "vitest";
import { matchesPreparedInviteDelivery } from "../supabase/functions/telegramEventSupergroup/activ020DeliveryEvidence";

const expected = { resultId: "3b172dd9d5e2432886a4d4107a6359fc", telegramUserId: 12345 };

describe("Activ020 webhook delivery evidence", () => {
  it("requires matching Telegram user, result id and message id", () => {
    expect(matchesPreparedInviteDelivery({ chosen_inline_result: {
      result_id: expected.resultId, from: { id: 12345 }, inline_message_id: "inline-message",
    } }, expected)).toBe(true);
  });

  it("rejects spoofable client fields and missing Telegram evidence", () => {
    expect(matchesPreparedInviteDelivery({}, expected)).toBe(false);
    expect(matchesPreparedInviteDelivery({ chosen_inline_result: {
      result_id: expected.resultId, from: { id: 999 }, inline_message_id: "inline-message",
    } }, expected)).toBe(false);
    expect(matchesPreparedInviteDelivery({ chosen_inline_result: {
      result_id: expected.resultId, from: { id: 12345 },
    } }, expected)).toBe(false);
    expect(matchesPreparedInviteDelivery({ chosen_inline_result: {
      result_id: "other", from: { id: 12345 }, inline_message_id: "inline-message",
    } }, expected)).toBe(false);
  });
});
