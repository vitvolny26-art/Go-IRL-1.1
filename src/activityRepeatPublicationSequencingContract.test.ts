/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sequencingMigration = readFileSync(
  new URL("../supabase/migrations/20260912150000_chrem002b_feedback_before_repeat.sql", import.meta.url),
  "utf8",
);
const repeatWorker = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/repeatPublication.ts", import.meta.url),
  "utf8",
);
const repeatCopyEntry = readFileSync(new URL("./repeatCopyCreateEntry.ts", import.meta.url), "utf8");

describe("ChRem002B organizer feedback -> Repeat sequencing contract", () => {
  it("does not claim Repeat until the same Activity organizer_feedback is durably sent", () => {
    expect(sequencingMigration).toContain("with feedback_ready as (");
    expect(sequencingMigration).toContain("notification.kind = 'post_event.organizer_confirmation'");
    expect(sequencingMigration).toContain("notification.payload ->> 'postEventStage' = 'organizer_feedback'");
    expect(sequencingMigration).toContain("notification.status = 'sent'");
    expect(sequencingMigration).toContain("notification.sent_at is not null");
    expect(sequencingMigration).toContain("join feedback_ready on feedback_ready.activity_id = activity.id");
  });

  it("lets a pending Repeat prompt become eligible from organizer feedback delivery rather than the old end-plus-24h clock", () => {
    expect(sequencingMigration).toContain("prompt.status = 'pending'");
    expect(sequencingMigration).not.toContain("coalesce(prompt.next_attempt_at, prompt.due_at) <= now()");
  });

  it("asks whether to repeat, then routes Yes to the existing editable Create copy without creating an Activity", () => {
    expect(repeatWorker).toContain("Хотите повторить событие");
    expect(repeatWorker).toContain('callback_data: `repeat:${prompt.prompt_id}:yes`');
    expect(repeatWorker).toContain("repeatCopyUrl(promptContext.source_activity_id, parsed.promptId)");
    expect(repeatWorker).not.toContain("await publishPublicActivity(");
    expect(repeatCopyEntry).toContain('state.setView("create")');
    expect(repeatCopyEntry).toContain('setFormValue(form, "date", "")');
    expect(repeatCopyEntry).toContain('setFormValue(form, "time", "")');
    expect(repeatCopyEntry).not.toContain(".insert(");
  });
});
