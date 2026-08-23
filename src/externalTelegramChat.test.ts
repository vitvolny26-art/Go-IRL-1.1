import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTelegramForumTopicUrl,
  canAccessExternalTelegramChat,
  loadLocalEventTelegramChatLink,
  normalizeExternalTelegramChatUrl,
  openExternalTelegramChat,
  openTelegramGroupCreation,
  removeLocalEventTelegramChatLink,
  resolveExternalTelegramChatLifecycle,
  saveLocalEventTelegramChatLink,
} from "./externalTelegramChat";

const activityId = "3b172dd9-d5e2-4328-86a4-d4107a6359fc";
const storage = new Map<string, string>();

describe("external Telegram chat links", () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) || null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
      open: vi.fn(),
    });
  });

  it("normalizes supported Telegram group and forum-topic links and rejects unsafe URLs", () => {
    expect(normalizeExternalTelegramChatUrl("https://telegram.me/+AbC_123-xyz/")).toBe("https://t.me/+AbC_123-xyz");
    expect(normalizeExternalTelegramChatUrl("https://t.me/joinchat/AbC_123-xyz")).toBe("https://t.me/joinchat/AbC_123-xyz");
    expect(normalizeExternalTelegramChatUrl("https://t.me/example_group")).toBe("https://t.me/example_group");
    expect(normalizeExternalTelegramChatUrl("https://t.me/c/1234567890/42")).toBe("https://t.me/c/1234567890/42");
    expect(normalizeExternalTelegramChatUrl("http://t.me/example_group")).toBeNull();
    expect(normalizeExternalTelegramChatUrl("https://evil.example/t.me/example_group")).toBeNull();
    expect(normalizeExternalTelegramChatUrl("https://t.me/example_group?start=unsafe")).toBeNull();
  });

  it("builds a private supergroup forum topic URL from Telegram ids", () => {
    expect(buildTelegramForumTopicUrl(-1001234567890, 42)).toBe("https://t.me/c/1234567890/42");
    expect(buildTelegramForumTopicUrl(-123, 42)).toBeNull();
    expect(buildTelegramForumTopicUrl(-1001234567890, 0)).toBeNull();
  });

  it("allows only the organizer and joined participants", () => {
    const base = { currentUserKey: "user:2", organizerUserKey: "user:1" };
    expect(canAccessExternalTelegramChat({ ...base, currentUserKey: "user:1" })).toBe(true);
    expect(canAccessExternalTelegramChat({ ...base, membershipStatus: "joined" })).toBe(true);
    expect(canAccessExternalTelegramChat({ ...base, membershipStatus: "pending" })).toBe(false);
    expect(canAccessExternalTelegramChat({ ...base, membershipStatus: "waiting" })).toBe(false);
    expect(canAccessExternalTelegramChat({ ...base, currentUserKey: null, membershipStatus: "joined" })).toBe(false);
  });

  it("marks event chat deletion due exactly 24 hours after event end", () => {
    const now = new Date("2026-07-26T12:00:00.000Z");
    expect(resolveExternalTelegramChatLifecycle({ kind: "team", now })).toBe("active");
    expect(resolveExternalTelegramChatLifecycle({ kind: "event", eventEndsAt: "2026-07-25T12:00:00.001Z", now })).toBe("active");
    expect(resolveExternalTelegramChatLifecycle({ kind: "event", eventEndsAt: "2026-07-25T12:00:00.000Z", now })).toBe("deletion_due");
    expect(resolveExternalTelegramChatLifecycle({ kind: "event", eventEndsAt: "2026-07-25T12:00:00.000Z", keepArchive: true, now })).toBe("archived");
  });

  it("stores normalized event links locally and removes them", () => {
    const saved = saveLocalEventTelegramChatLink(activityId, "https://telegram.me/+AbC_123-xyz/", "user:1");
    expect(saved?.url).toBe("https://t.me/+AbC_123-xyz");
    expect(loadLocalEventTelegramChatLink(activityId)).toMatchObject({
      kind: "event",
      url: "https://t.me/+AbC_123-xyz",
      attachedByUserKey: "user:1",
    });

    removeLocalEventTelegramChatLink(activityId);
    expect(loadLocalEventTelegramChatLink(activityId)).toBeNull();
  });

  it("does not store invalid event links", () => {
    expect(saveLocalEventTelegramChatLink(activityId, "javascript:alert(1)", "user:1")).toBeNull();
    expect(loadLocalEventTelegramChatLink(activityId)).toBeNull();
  });

  it("keeps the legacy Telegram startgroup opener for existing fallback flows", () => {
    const openTelegramLink = vi.fn();
    const openBrowser = vi.fn();

    expect(openTelegramGroupCreation({ openTelegramLink, openBrowser })).toBe(true);
    expect(openTelegramLink).toHaveBeenCalledWith("https://t.me/GOirl_bot?startgroup=go_irl_event");
    expect(openBrowser).not.toHaveBeenCalled();
  });

  it("uses Telegram WebApp opening when available", () => {
    const openTelegramLink = vi.fn();
    const openBrowser = vi.fn();

    expect(openExternalTelegramChat("https://t.me/c/1234567890/42", { openTelegramLink, openBrowser })).toBe(true);
    expect(openTelegramLink).toHaveBeenCalledWith("https://t.me/c/1234567890/42");
    expect(openBrowser).not.toHaveBeenCalled();
    expect(openExternalTelegramChat("javascript:alert(1)", { openTelegramLink, openBrowser })).toBe(false);
  });
});