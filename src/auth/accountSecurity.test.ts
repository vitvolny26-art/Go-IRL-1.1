import { describe, expect, it } from "vitest";
import {
  accountSecurityFeedbackStorageKey,
  canLinkProvider,
  consumeAccountSecurityFeedback,
  writeAccountSecurityFeedback,
} from "./accountSecurity";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};

describe("account security linking contract", () => {
  it("keeps link feedback provider-scoped and one-time", () => {
    const storage = memoryStorage();
    writeAccountSecurityFeedback(storage, { status: "linked", provider: "facebook" });
    const stored = storage.getItem(accountSecurityFeedbackStorageKey) || "";
    expect(stored).not.toContain("email");
    expect(stored).not.toContain("providerUserId");
    expect(stored).not.toContain("firstName");
    expect(stored).not.toContain("avatar");
    expect(consumeAccountSecurityFeedback(storage)).toEqual({ status: "linked", provider: "facebook", error: undefined });
    expect(consumeAccountSecurityFeedback(storage)).toBeNull();
  });

  it("does not offer a provider that is already active", () => {
    expect(canLinkProvider([{ provider: "google", status: "active" }], "google")).toBe(false);
    expect(canLinkProvider([{ provider: "google", status: "revoked" }], "google")).toBe(true);
    expect(canLinkProvider([{ provider: "telegram", status: "active" }], "facebook")).toBe(true);
  });
});
