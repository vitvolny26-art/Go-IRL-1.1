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

  it("keeps No on the legacy decision RPC while Yes becomes an idempotent private draft", () => {
    expect(repeatWorker).toContain('go_irl_repeat_publication_decision');
    expect(repeatWorker).toContain('if (parsed.decision === "yes")');
    expect(repeatWorker).toContain('createEditableRepeatDraft');
    expect(repeatWorker).toContain('visibility: "private"');
    expect(repeatWorker).toContain('editableDraft: true');
    expect(repeatWorker).toContain('status: "yes"');
    expect(repeatWorker).toContain('next_activity_id: draftId');
  });

  it("does not auto-publish a repeated Activity and gives the organizer an explicit edit link", () => {
    expect(repeatWorker).not.toContain("await publishPublicActivity(");
    expect(repeatWorker).toContain('button: "Редактировать событие"');
    expect(repeatWorker).toContain('url: draftEditUrl(row.created_activity_id)');
    expect(repeatWorker).toContain('published: false');
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
