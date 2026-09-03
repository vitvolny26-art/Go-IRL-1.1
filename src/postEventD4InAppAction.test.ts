/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { buildPostEventActivityPath, resolvePostEventEntryIntent } from "./postEventEntry";
import {
  loadOrganizerPostEventState,
  loadParticipantPostEventState,
  organizerPostEventComplete,
  participantPostEventComplete,
  postEventIntentFromNotificationRow,
  recordOrganizerPostEventOutcome,
  submitParticipantPostEventAttendance,
  submitPostEventOrganizerRating,
  type PostEventRpcClient,
} from "./postEventState";
import { buildEventNotificationOpenUrl } from "./notifications/repository";

const activityId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";
const feedbackId = "6da432ad-08a5-4c88-a5b8-a7842fe43802";
const portalSource = readFileSync(new URL("./components/PostEventInAppPortal.tsx", import.meta.url), "utf8");
const notificationBootstrap = readFileSync(new URL("./participantNotifications.ts", import.meta.url), "utf8");

describe("POSTEVENT001 D4 in-app action surface", () => {
  it("builds and parses a bounded Activity post-event deep link", () => {
    const href = buildPostEventActivityPath(activityId, feedbackId);
    expect(href).toBe(`/activities?post_event_activity=${activityId}&post_event_feedback=${feedbackId}#post_event`);
    expect(resolvePostEventEntryIntent(new URL(`https://go-irl.fun${href}`))).toEqual({ activityId, feedbackId });
    expect(resolvePostEventEntryIntent({ pathname: "/activities", search: `?post_event_activity=${activityId}&post_event_feedback=bad`, hash: "#post_event" })).toBeNull();
  });

  it("synthesizes POSTEVENT notification URLs without requiring a stored openPath", () => {
    expect(buildEventNotificationOpenUrl("https://go-irl.fun", {
      eventId: activityId,
      postEventStage: "organizer_initial",
    }, activityId)).toBe(`https://go-irl.fun/activities?post_event_activity=${activityId}#post_event`);
    expect(buildEventNotificationOpenUrl("https://go-irl.fun/", {
      eventId: activityId,
      feedbackId,
      postEventStage: "participant_confirmation",
    }, activityId)).toBe(`https://go-irl.fun/activities?post_event_activity=${activityId}&post_event_feedback=${feedbackId}#post_event`);
  });

  it("maps canonical in-app outbox rows to organizer and participant intents", () => {
    expect(postEventIntentFromNotificationRow({
      id: "notification-1",
      activity_id: activityId,
      kind: "post_event.organizer_confirmation",
      payload: { eventId: activityId, postEventStage: "organizer_initial" },
      created_at: "2026-09-03T08:00:03.000Z",
    })).toMatchObject({ key: `organizer:${activityId}`, activityId });
    expect(postEventIntentFromNotificationRow({
      id: "notification-2",
      activity_id: activityId,
      kind: "post_event.participant_confirmation",
      payload: { eventId: activityId, feedbackId, postEventStage: "participant_confirmation" },
      created_at: "2026-09-03T12:00:03.000Z",
    })).toMatchObject({ key: `participant:${feedbackId}`, activityId, feedbackId });
  });

  it("uses only the existing actor-validated POSTEVENT RPC surface", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "go_irl_get_activity_post_event_organizer_state") return { data: [{ activity_id: activityId, event_resolution: "pending", organizer_event_claim: "happened", organizer_roster_finalized_at: null, participant_fallback_at: "2026-09-03T12:00:00Z", feedback_id: feedbackId, participant_display_name: "A", eligibility_state: "eligible", organizer_draft_absent: false, organizer_claim: null, participant_claim: null, attendance_resolution: "pending" }], error: null };
      if (name === "go_irl_get_activity_post_event_participant_state") return { data: [{ feedback_id: feedbackId, activity_id: activityId, event_resolution: "confirmed_happened", organizer_event_claim: "happened", participant_fallback_at: "2026-09-03T12:00:00Z", eligibility_state: "eligible", organizer_claim: "attended", participant_claim: "attended", attendance_resolution: "attended", organizer_rating: null, rating_tags: [] }], error: null };
      return { data: null, error: null };
    });
    const client = { rpc } as unknown as PostEventRpcClient;
    const dependencies = { client, initializeAuth: async () => ({ source: "trusted-provider" }) };

    const organizer = await loadOrganizerPostEventState(activityId, dependencies);
    const participant = await loadParticipantPostEventState(feedbackId, dependencies);
    expect(organizerPostEventComplete(organizer)).toBe(false);
    expect(participantPostEventComplete(participant)).toBe(false);

    await recordOrganizerPostEventOutcome(activityId, "happened", dependencies);
    await submitParticipantPostEventAttendance(feedbackId, "attended", dependencies);
    await submitPostEventOrganizerRating(feedbackId, 5, ["organization"], dependencies);

    expect(rpc.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining([
      "go_irl_get_activity_post_event_organizer_state",
      "go_irl_get_activity_post_event_participant_state",
      "go_irl_record_activity_post_event_outcome",
      "go_irl_submit_activity_attendance_confirmation",
      "go_irl_submit_organizer_rating",
    ]));
  });

  it("renders organizer roster, participant confirmation and 1-5 rating without a parallel trust store", () => {
    expect(portalSource).toContain("toggleOrganizerPostEventAbsence");
    expect(portalSource).toContain("finalizeOrganizerPostEventAttendance");
    expect(portalSource).toContain("participantEventMissing");
    expect(portalSource).toContain("[1, 2, 3, 4, 5]");
    expect(portalSource).not.toContain("localStorage");
    expect(notificationBootstrap).toContain("enablePostEventInAppActions");
  });
});
