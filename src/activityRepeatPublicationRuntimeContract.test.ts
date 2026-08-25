/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edgeIndex = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/index.ts", import.meta.url),
  "utf8",
);
const repeatWorker = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/repeatPublication.ts", import.meta.url),
  "utf8",
);
const createUx = readFileSync(new URL("./fullCreateTaxonomy.ts", import.meta.url), "utf8");

describe("ACT080-005C Telegram repeat worker and Create UX contract", () => {
  it("keeps the existing Telegram webhook and intercepts callback_query in the same Edge function", () => {
    expect(edgeIndex).toContain('await import("./legacy.ts")');
    expect(edgeIndex).toContain("x-telegram-bot-api-secret-token");
    expect(edgeIndex).toContain("update.callback_query");
    expect(edgeIndex).toContain("handleRepeatPublicationCallback");
  });

  it("claims due prompts and sends organizer private Telegram Yes/No buttons", () => {
    expect(repeatWorker).toContain('go_irl_claim_due_repeat_publication_prompts');
    expect(repeatWorker).toContain('callback_data: `repeat:${prompt.prompt_id}:yes`');
    expect(repeatWorker).toContain('callback_data: `repeat:${prompt.prompt_id}:no`');
    expect(repeatWorker).toContain('go_irl_finish_repeat_publication_prompt');
  });

  it("routes callbacks through the atomic idempotent decision RPC", () => {
    expect(repeatWorker).toContain('go_irl_repeat_publication_decision');
    expect(repeatWorker).toContain('p_telegram_user_id: String(telegramUserId)');
    expect(repeatWorker).toContain('row.duplicate');
    expect(repeatWorker).toContain('editMessageReplyMarkup');
  });

  it("publishes the next public Activity to its city only after a fresh Yes decision", () => {
    expect(repeatWorker).toContain('parsed.decision === "yes" && row.created_activity_id && !row.duplicate && row.visibility === "public"');
    expect(edgeIndex).toContain("publishCityActivity");
    expect(edgeIndex).toContain("https://go-irl.fun/join/${activity.id}");
  });

  it("turns Create Repeat into an opt-in without asking series boundary questions", () => {
    expect(createUx).toContain('boundaryFieldset.hidden = true');
    expect(createUx).toContain('untilInput.value = dateInput.value');
    expect(createUx).toContain('enableRepeatPublicationCreateUx()');
  });

  it("does not auto-enable Repeat when opening Repeat event from history", () => {
    expect(createUx).not.toContain('input[name="recurrenceMode"][value="weekly"].click');
    expect(createUx).not.toContain('recurrenceMode = "weekly"');
  });
});
