import { describe, expect, it } from "vitest";
import { SupabaseOrganizerFavoritesRepository } from "./organizerFavoritesRepository";

const createLoadClient = (row: unknown) => {
  const calls: Array<[string, unknown]> = [];
  const chain = {
    select: () => chain,
    eq: (field: string, value: unknown) => {
      calls.push([field, value]);
      return chain;
    },
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return {
    calls,
    client: { from: (table: string) => {
      calls.push(["table", table]);
      return chain;
    } },
  };
};

const createActiveClient = (rows: unknown[]) => {
  const calls: Array<[string, unknown]> = [];
  const chain = {
    select: () => chain,
    eq: (field: string, value: unknown) => {
      calls.push([field, value]);
      return chain;
    },
    order: async (field: string, options: unknown) => {
      calls.push([`order:${field}`, options]);
      return { data: rows, error: null };
    },
  };
  return {
    calls,
    client: { from: (table: string) => {
      calls.push(["table", table]);
      return chain;
    } },
  };
};

const createSetClient = () => {
  let payload: Record<string, unknown> | null = null;
  let options: Record<string, unknown> | null = null;
  const chain = {
    select: () => chain,
    single: async () => ({
      data: { subject_id: "organizer:2", status: "active", updated_at: "2026-07-28T22:30:00.000Z" },
      error: null,
    }),
  };
  return {
    read: () => ({ payload, options }),
    client: { from: () => ({
      upsert: (nextPayload: Record<string, unknown>, nextOptions: Record<string, unknown>) => {
        payload = nextPayload;
        options = nextOptions;
        return chain;
      },
    }) },
  };
};

describe("SupabaseOrganizerFavoritesRepository", () => {
  it("loads only the authenticated user's organizer favorite", async () => {
    const mock = createLoadClient({
      subject_id: "organizer:2",
      status: "active",
      updated_at: "2026-07-28T22:30:00.000Z",
    });
    const repository = new SupabaseOrganizerFavoritesRepository(mock.client as never, "user:1");

    await expect(repository.load("organizer:2")).resolves.toEqual({
      organizerUserKey: "organizer:2",
      isFavorite: true,
      updatedAt: "2026-07-28T22:30:00.000Z",
    });
    expect(mock.calls).toEqual([
      ["table", "favorites"],
      ["user_key", "user:1"],
      ["subject_type", "organizer"],
      ["subject_id", "organizer:2"],
    ]);
  });

  it("loads the actor's active organizer favorites for the profile projection", async () => {
    const mock = createActiveClient([
      { subject_id: "organizer:2", status: "active", updated_at: "2026-09-12T17:00:00.000Z" },
      { subject_id: "organizer:3", status: "active", updated_at: "2026-09-11T17:00:00.000Z" },
    ]);
    const repository = new SupabaseOrganizerFavoritesRepository(mock.client as never, "user:1");

    await expect(repository.loadActive()).resolves.toEqual([
      { organizerUserKey: "organizer:2", isFavorite: true, updatedAt: "2026-09-12T17:00:00.000Z" },
      { organizerUserKey: "organizer:3", isFavorite: true, updatedAt: "2026-09-11T17:00:00.000Z" },
    ]);
    expect(mock.calls).toEqual([
      ["table", "favorites"],
      ["user_key", "user:1"],
      ["subject_type", "organizer"],
      ["status", "active"],
      ["order:updated_at", { ascending: false }],
    ]);
  });

  it("upserts an idempotent organizer favorite relation", async () => {
    const mock = createSetClient();
    const repository = new SupabaseOrganizerFavoritesRepository(mock.client as never, "user:1");

    await expect(repository.set("organizer:2", true)).resolves.toMatchObject({
      organizerUserKey: "organizer:2",
      isFavorite: true,
    });
    expect(mock.read().payload).toMatchObject({
      user_key: "user:1",
      subject_type: "organizer",
      subject_id: "organizer:2",
      organizer_user_key: "organizer:2",
      status: "active",
      source: "organizer_profile",
      removed_at: null,
    });
    expect(mock.read().options).toEqual({ onConflict: "user_key,subject_type,subject_id" });
  });
});
