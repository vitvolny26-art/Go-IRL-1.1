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
const repeatCopyEntry = readFileSync(new URL("./repeatCopyCreateEntry.ts", import.meta.url), "utf8");

describe("ACT080-005C / ChRem002b Telegram repeat Create-copy contract", () => {
  it("keeps the existing Telegram webhook and intercepts callback_query in the same Edge function", () => {
    expect(edgeIndex).toContain('await import("./legacy.ts")');
    expect(edgeIndex).toContain("x-telegram-bot-api-secret-token");
    expect(edgeIndex).toContain("update.callback_query");
    expect(edgeIndex).toContain("handleRepeatPublicationCallback");
  });

  it("claims due prompts and sends organizer private Telegram Yes/No buttons", () => {
    expect(repeatWorker).toContain("go_irl_claim_due_repeat_publication_prompts");
    expect(repeatWorker).toContain('callback_data: `repeat:${prompt.prompt_id}:yes`');
    expect(repeatWorker).toContain('callback_data: `repeat:${prompt.prompt_id}:no`');
    expect(repeatWorker).toContain("go_irl_finish_repeat_publication_prompt");
  });

  it("keeps No on the legacy decision RPC while Yes records only an idempotent copy intent", () => {
    expect(repeatWorker).toContain("go_irl_repeat_publication_decision");
    expect(repeatWorker).toContain('if (parsed.decision === "yes")');
    expect(repeatWorker).toContain("confirmRepeatCopyIntent");
    expect(repeatWorker).toContain('status: "yes"');
    expect(repeatWorker).toContain("next_activity_id: null");
    expect(repeatWorker).not.toContain('supabase.from("activities").insert');
    expect(repeatWorker).not.toContain('supabase.from("activity_members").insert');
  });

  it("routes Repeat Yes to the existing Create surface instead of materializing an Activity", () => {
    expect(repeatWorker).not.toContain("await publishPublicActivity(");
    expect(repeatWorker).toContain('intent: "repeat_copy"');
    expect(repeatWorker).toContain('source: sourceActivityId');
    expect(repeatWorker).toContain("repeatCopyUrl(promptContext.source_activity_id, parsed.promptId)");
    expect(repeatWorker).toContain('button: "Редактировать копию"');
    expect(repeatWorker).toContain("published: false");

    expect(createUx).toContain("enableRepeatCopyCreateEntry");
    expect(repeatCopyEntry).toContain('.eq("organizer_key", userKey)');
    expect(repeatCopyEntry).toContain('state.setView("create")');
    expect(repeatCopyEntry).toContain('setFormValue(form, "date", "")');
    expect(repeatCopyEntry).toContain('setFormValue(form, "time", "")');
    expect(repeatCopyEntry).not.toContain(".insert(");
  });

  it("turns Create Repeat into an opt-in without asking series boundary questions", () => {
    expect(createUx).toContain("boundaryFieldset.hidden = true");
    expect(createUx).toContain("untilInput.value = dateInput.value");
    expect(createUx).toContain("enableRepeatPublicationCreateUx()");
  });

  it("does not auto-enable Repeat when opening Repeat event from history", () => {
    expect(createUx).not.toContain('input[name="recurrenceMode"][value="weekly"].click');
    expect(createUx).not.toContain('recurrenceMode = "weekly"');
  });
});
