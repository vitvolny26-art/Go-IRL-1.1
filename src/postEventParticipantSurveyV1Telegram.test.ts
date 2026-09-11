import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PARTICIPANT_COMPLETION_CLEANUP_DELAY_MS,
  parseParticipantPostEventSurveyCallback,
  participantSurveyUuidFromToken,
  participantSurveyUuidToken,
} from "../supabase/functions/telegramEventSupergroup/postEventParticipantSurvey";

const feedbackId = "223e4567-e89b-42d3-a456-426614174000";
const peerId = "423e4567-e89b-42d3-a456-426614174002";
const participantSurveySource = readFileSync(
  new URL("../supabase/functions/telegramEventSupergroup/postEventParticipantSurvey.ts", import.meta.url),
  "utf8",
);
const dispatcherSource = readFileSync(new URL("./notifications/dispatcher.ts", import.meta.url), "utf8");

describe("participant Telegram survey V1 callback wiring", () => {
  it("upgrades already-sent legacy attendance callbacks into the V1 attendance action", () => {
    expect(parseParticipantPostEventSurveyCallback(`pe:p:${feedbackId}:a`)).toEqual({
      action: "participant_survey_attendance",
      targetId: feedbackId,
      value: "attended",
    });
    expect(parseParticipantPostEventSurveyCallback(`pe:p:${feedbackId}:x`)).toEqual({
      action: "participant_survey_attendance",
      targetId: feedbackId,
      value: "absent",
    });
    expect(parseParticipantPostEventSurveyCallback(`pe:p:${feedbackId}:n`)).toBeNull();
  });

  it("round-trips compact UUID tokens and parses rating/issues/peers/repeat callbacks", () => {
    const target = participantSurveyUuidToken(feedbackId);
    const peer = participantSurveyUuidToken(peerId);
    expect(participantSurveyUuidFromToken(target)).toBe(feedbackId);

    expect(parseParticipantPostEventSurveyCallback(`pe:pr:${target}:2`)).toMatchObject({
      action: "participant_rating", targetId: feedbackId, value: "2",
    });
    expect(parseParticipantPostEventSurveyCallback(`pe:pi:${target}:c:1`)).toMatchObject({
      action: "participant_issue_tag", targetId: feedbackId, value: "communication:on",
    });
    expect(parseParticipantPostEventSurveyCallback(`pe:pid:${target}`)).toMatchObject({
      action: "participant_issue_done", targetId: feedbackId, value: "done",
    });
    expect(parseParticipantPostEventSurveyCallback(`pe:pp:${target}:${peer}:1`)).toMatchObject({
      action: "participant_peer_presence", targetId: feedbackId, value: `${peerId}:on`,
    });
    expect(parseParticipantPostEventSurveyCallback(`pe:ppd:${target}`)).toMatchObject({
      action: "participant_peer_done", targetId: feedbackId, value: "done",
    });
    expect(parseParticipantPostEventSurveyCallback(`pe:pri:${target}:y`)).toMatchObject({
      action: "participant_repeat_intent", targetId: feedbackId, value: "yes",
    });
  });

  it("keeps the longest peer callback within Telegram's 64-byte callback_data limit", () => {
    const target = participantSurveyUuidToken(feedbackId);
    const peer = participantSurveyUuidToken(peerId);
    expect(new TextEncoder().encode(`pe:pp:${target}:${peer}:1`).length).toBeLessThanOrEqual(64);
  });

  it("schedules only completed participant messages for the 15-minute cleanup path", () => {
    expect(PARTICIPANT_COMPLETION_CLEANUP_DELAY_MS).toBe(15 * 60_000);
    expect(participantSurveySource).toContain('state.nextStep === "complete"');
    expect(participantSurveySource).toContain('postEventStage: "participant_cleanup"');
    expect(participantSurveySource).toContain(':participant:${state.feedbackId}:cleanup');
    expect(dispatcherSource).toContain('messageDelivery.payload.postEventStage === "participant_cleanup"');
    expect(dispatcherSource).toContain('return this.deleteOrganizerCompletion(messageDelivery)');
  });
});
