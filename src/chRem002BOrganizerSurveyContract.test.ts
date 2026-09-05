/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildOrganizerSurveyKeyboard,
  buildOrganizerSurveyText,
  ORGANIZER_SURVEY_COMPLETION_CLEANUP_WINDOW_MS,
  organizerSurveyCopy,
  resolveOrganizerSurveyLanguage,
} from "../api/_shared/post-event-organizer-survey";

const migration = readFileSync(
  new URL("../supabase/migrations/20260905233000_chrem002b_organizer_survey_state.sql", import.meta.url),
  "utf8",
);
const verifier = readFileSync(
  new URL("../supabase/verify_chrem002b_organizer_survey_state.sql", import.meta.url),
  "utf8",
);
const dispatcher = readFileSync(new URL("./notifications/dispatcher.ts", import.meta.url), "utf8");

describe("ChRem002B organizer survey contract", () => {
  it("uses canonical-language-first resolution with English fallback", () => {
    expect(resolveOrganizerSurveyLanguage("uk", "ru")).toBe("uk");
    expect(resolveOrganizerSurveyLanguage("xx", "cs-CZ")).toBe("cs");
    expect(resolveOrganizerSurveyLanguage(null, "xx")).toBe("en");
    expect(Object.keys(organizerSurveyCopy).sort()).toEqual(["cs", "en", "pl", "ru", "sk", "uk"]);
  });

  it("implements the exact four-step branching with at most two participant buttons per row", () => {
    const activityId = "123e4567-e89b-42d3-a456-426614174000";
    expect(buildOrganizerSurveyText("ru", "outcome")).toBe("Состоялась?");
    expect(organizerSurveyCopy.ru.noShows).toBe("Были no-show");
    expect(buildOrganizerSurveyKeyboard("ru", "outcome", activityId).inline_keyboard[0]).toHaveLength(2);
    expect(buildOrganizerSurveyKeyboard("ru", "experience", activityId).inline_keyboard[0]).toHaveLength(2);
    expect(buildOrganizerSurveyKeyboard("ru", "attendance", activityId).inline_keyboard[0]).toHaveLength(2);
    const roster = [1, 2, 3, 4, 5].map((value) => ({
      feedbackId: `${String(value).padStart(8, "0")}-e89b-42d3-a456-426614174000`,
      displayName: `U${value}`,
      absent: value === 2,
    }));
    const q4 = buildOrganizerSurveyKeyboard("ru", "no_shows", activityId, roster);
    for (const row of q4.inline_keyboard.slice(0, -1)) expect(row.length).toBeLessThanOrEqual(2);
    expect(q4.inline_keyboard.at(-1)).toHaveLength(1);
  });

  it("uses the approved localized completion and next-worker cleanup window", () => {
    expect(organizerSurveyCopy.ru.completion).toBe("Спасибо, что воспользовались GO IRL");
    expect(ORGANIZER_SURVEY_COMPLETION_CLEANUP_WINDOW_MS).toBe(15 * 60_000);
    expect(migration).toContain("    now(),");
    expect(migration).not.toContain("now() + interval '60 seconds'");
    expect(migration).toContain("'postEventStage', 'organizer_cleanup'");
    expect(dispatcher).toContain('messageDelivery.payload.postEventStage === "organizer_cleanup"');
    expect(dispatcher).toContain("deleteOrganizerCompletion");
  });

  it("does not overload the legacy top-level problem outcome for Q2", () => {
    expect(migration).toContain("organizer_experience");
    expect(migration).toContain("'good','had_problems'");
    expect(migration).toContain("p_action = 'organizer_experience'");
    expect(migration).toContain("p_action = 'organizer_attendance_summary'");
  });

  it("reuses canonical attendance roster and requires an explicit absence value", () => {
    expect(migration).toContain("public.activity_attendance_feedback");
    expect(migration).toContain("organizer_draft_absent = p_absent");
    expect(migration).toContain("p_value = 'absent'");
    expect(migration).not.toContain("create table public.chrem");
  });

  it("schedules 10:00 from the local calendar day after actual event end", () => {
    expect(migration).toContain("v_event_local_end_date := (v_event_ends_at at time zone v_timezone)::date");
    expect(migration).toContain("postevent_local_day_time(v_event_local_end_date, 1, 10, new.city_id)");
    expect(migration).toContain("chrem002b_organizer_reminder_removed");
    expect(migration).not.toContain("postevent_local_day_time(v_event_local_end_date, 1, 12, new.city_id)");
    expect(verifier).toContain("chrem002b_verify_next_day_after_end_10_missing");
  });

  it("fails closed if the fresh-main post-event Telegram-primary routing migration is missing", () => {
    expect(migration).toContain("chrem002b_postevent_telegram_primary_route_fix_required");
    expect(verifier).toContain("chrem002b_verify_postevent_telegram_route_missing");
  });
});
