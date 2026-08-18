import { describe, expect, it } from "vitest";
import workspaceSource from "./BeautyPilotWorkspace.tsx?raw";

describe("Beauty professional workspace server booking wiring", () => {
  it("loads the professional server projection and keeps local fallback explicit", () => {
    expect(workspaceSource).toContain("loadProfessionalServiceBookings(language)");
    expect(workspaceSource).toContain('bookingSource === "server"');
    expect(workspaceSource).toContain('bookingSource === "local-fallback"');
    expect(workspaceSource).toContain("Browser Mock Mode");
  });

  it("transitions server bookings with expected status and updated-at guards", () => {
    expect(workspaceSource).toContain("transitionProfessionalServiceBooking({");
    expect(workspaceSource).toContain("expectedStatus: current.status");
    expect(workspaceSource).toContain("expectedUpdatedAt: current.updatedAt");
    expect(workspaceSource).toContain('output.result === "stale"');
    expect(workspaceSource).toContain('output.result === "invalid_transition"');
  });

  it("wires confirmed server booking reschedule through the canonical RPC repository", () => {
    expect(workspaceSource).toContain("rescheduleProfessionalServiceBooking({");
    expect(workspaceSource).toContain("pragueLocalDateTimeToIso(targetDate, form.time)");
    expect(workspaceSource).toContain('dialog !== "block" && <label>Дата');
    expect(workspaceSource).toContain('occupied.has(`${form.date}:${slot}`)');
    expect(workspaceSource).toContain('output.result === "slot_unavailable"');
    expect(workspaceSource).toContain('output.result === "slot_blocked"');
    expect(workspaceSource).toContain('output.result === "slot_taken"');
    expect(workspaceSource).toContain("Перенести можно только подтверждённую запись");
  });

  it("does not mix pilot appointments or local manual scheduling into server mode", () => {
    expect(workspaceSource).toContain("...(serverBacked ? [] : data.appointments)");
    expect(workspaceSource).toContain("disabled={serverBacked}");
    expect(workspaceSource).toContain("Расписание мастера синхронизируется с клиентским календарём");
  });
});
