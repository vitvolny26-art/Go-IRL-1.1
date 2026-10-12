import { describe, expect, it, vi } from "vitest";
import { handleActiv020ChosenInlineResult } from "../supabase/functions/telegramEventSupergroup/activ020ChosenInlineResult";

const draftId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";
const resultId = draftId.replaceAll("-", "");
const chosen = { result_id: resultId, from: { id: 12345 }, inline_message_id: "inline-abc" };

const fakeDb = (state: string, telegramUser = "12345") => {
  const update = vi.fn(() => ({
    eq: () => ({
      eq: () => ({
        select: () => ({ maybeSingle: async () => ({ data: { id: draftId }, error: null }) }),
      }),
    }),
  }));
  const from = (table: string) => {
    if (table === "activity_invite_drafts") return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: draftId, organizer_key: "owner",
            state, prepared_message_id: "prepared", expires_at: "2099-01-01T00:00:00Z" }, error: null }),
        }),
      }),
      update,
    };
    return {
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              not: () => ({ maybeSingle: async () => ({ data: {
                provider_user_id: telegramUser,
              }, error: null }) }),
            }),
          }),
        }),
      }),
    };
  };
  return { from, update };
};

describe("Activ020 chosen-inline delivery webhook", () => {
  it("rejects unrelated Telegram updates before touching the database", async () => {
    const db = fakeDb("prepared");
    await expect(handleActiv020ChosenInlineResult(db, { result_id: "not-an-id" }))
      .resolves.toEqual({ handled: false, confirmed: false });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("only transitions a matching prepared draft", async () => {
    const db = fakeDb("prepared");
    await expect(handleActiv020ChosenInlineResult(db, chosen))
      .resolves.toEqual({ handled: true, confirmed: true });
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({ state: "sent" }));
  });

  it("does not accept a different sender or a cancelled draft", async () => {
    const wrong = fakeDb("prepared", "99999");
    await expect(handleActiv020ChosenInlineResult(wrong, chosen))
      .resolves.toEqual({ handled: true, confirmed: false });
    expect(wrong.update).not.toHaveBeenCalled();
    const cancelled = fakeDb("cancelled");
    await expect(handleActiv020ChosenInlineResult(cancelled, chosen))
      .resolves.toEqual({ handled: true, confirmed: false });
    expect(cancelled.update).not.toHaveBeenCalled();
  });
});
