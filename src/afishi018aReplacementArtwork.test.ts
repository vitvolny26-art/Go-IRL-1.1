import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("../supabase/functions/telegramEventSupergroup/activityJoinCallbackBase.ts", () => ({ resolveTelegramUser: vi.fn() }));
vi.mock("../supabase/functions/telegramEventSupergroup/communicationVerification.ts", () => ({ sendCommunicationVerificationRequests: vi.fn() }));
// Load the Deno module at runtime without adding its URL imports to the browser TS project.
const publisherModule = "../supabase/functions/telegramEventSupergroup/cityPostersPublication.ts";
const { publishCityPosterEvent }: { publishCityPosterEvent: (args: {
  eventId: string; supabase: SupabaseClient;
  telegramApi: <T>(method: string, body?: unknown) => Promise<T>;
}) => Promise<Record<string, unknown>> } = await import(publisherModule);

const eventId = "28bbdcc5-659c-4282-87fc-3515afa3f969";
const slug = "retro-vikend-na-olomouckych-podebradech-2026";
const chatId = -1004451765209;

function fixture(failDelete = false, publishedAt?: string) {
  let messageId = 97;
  const updates: Array<Record<string, unknown>> = [];
  const supabase = { from(table: string) {
    let update: Record<string, unknown> | undefined;
    const query = {
      select() { return query; }, eq() { return query; }, in() { return query; },
      or() { return query; }, order() { return query; }, limit() { return query; },
      update(value: Record<string, unknown>) { update = value; return query; },
      maybeSingle() { return Promise.resolve(result()); },
      then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
    };
    function result() {
      if (update) {
        updates.push(update);
        if (update.telegram_message_id !== undefined) messageId = Number(update.telegram_message_id);
        return { data: { event_id: eventId }, error: null };
      }
      const data = table === "city_posters_events"
        ? { id: eventId, city_id: "olomouc", canonical_slug: slug, status: "published", hero_media_url: "https://example.com/original.avif", metadata: { telegram_topic_kind: "outdoor" } }
        : table === "city_posters_event_translations"
          ? [{ language: "cs", title: "RETRO", description: "Poděbrady" }]
          : table === "city_posters_occurrences"
            ? { starts_at: "2099-10-03T09:00:00Z", ends_at: "2099-10-04T17:00:00Z" }
            : { telegram_chat_id: chatId, telegram_message_id: messageId, deleted_at: null, published_at: publishedAt };
      return { data, error: null };
    }
    return query;
  } } as unknown as SupabaseClient;
  const calls: Array<{ method: string; body: unknown }> = [];
  const telegramApi = async <T>(method: string, body?: unknown): Promise<T> => {
    calls.push({ method, body });
    if (method === "deleteMessage" && (body as { message_id: number }).message_id === 97 && failDelete) throw new Error("old message deletion failed");
    return (["sendPhoto", "editMessageMedia"].includes(method) ? { message_id: method === "sendPhoto" ? 101 : 97, photo: [{ file_id: "test-photo", file_unique_id: "test-identity" }] } : true) as T;
  };
  return { eventId, supabase, telegramApi, calls, updates, activeMessage: () => messageId };
}

afterEach(() => vi.unstubAllGlobals());

describe("AFISHI018A replacement artwork", () => {
  it("uploads controlled artwork to Venku and deletes the old message after the ledger replacement", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const f = fixture();
    const result = await publishCityPosterEvent(f);
    expect(fetchMock).toHaveBeenCalledOnce();
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin).toBe("https://go-irl-1-1.vercel.app");
    expect(url.pathname).toBe("/api/telegram/city-posters-share-card");
    expect(url.searchParams.get("slug")).toBe(slug);
    expect(url.searchParams.get("language")).toBe("cs");
    const upload = f.calls.find(call => call.method === "sendPhoto")?.body as FormData;
    expect(upload.get("chat_id")).toBe(String(chatId));
    expect(upload.get("message_thread_id")).toBe("6");
    expect((upload.get("photo") as File).type).toBe("image/png");
    expect(result).toMatchObject({ published: true, replaced: true, messageId: 101, oldMessageId: 97, chatId });
    expect(f.activeMessage()).toBe(101);
    expect(f.calls.filter(call => call.method === "deleteMessage")).toEqual([{ method: "deleteMessage", body: { chat_id: chatId, message_id: 97 } }]);
  });

  it("restores the old ledger and removes the replacement if old-message cleanup fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("png", { headers: { "content-type": "image/png" } })));
    const f = fixture(true);
    await expect(publishCityPosterEvent(f)).rejects.toThrow("old message deletion failed");
    expect(f.updates.map(update => update.telegram_message_id)).toEqual([101, 97]);
    expect(f.activeMessage()).toBe(97);
    expect(f.calls).toContainEqual({ method: "deleteMessage", body: { chat_id: chatId, message_id: 101 } });
    expect(f.calls.filter(call => call.method === "deleteMessage" && (call.body as { message_id: number }).message_id === 101)).toHaveLength(1);
  });

  it("adds a photo in place after the Telegram deletion window without creating or deleting messages", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("jpeg", { headers: { "content-type": "image/jpeg" } })));
    const f = fixture(false, "2000-01-01T00:00:00Z");
    const result = await publishCityPosterEvent(f);
    expect(f.calls.map(call => call.method)).toEqual(["editMessageMedia"]);
    const form = f.calls[0].body as FormData;
    expect(form.get("message_id")).toBe("97");
    expect(form.get("chat_id")).toBe(String(chatId));
    expect(JSON.parse(String(form.get("media")))).toMatchObject({ type: "photo", media: "attach://photo" });
    expect(result).toMatchObject({ published: true, editedInPlace: true, photoIdentityVerified: true, messageId: 97 });
    expect(f.activeMessage()).toBe(97);
    expect(f.updates).toHaveLength(1);
  });

  it("leaves the ledger untouched when in-place Telegram media editing fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("jpeg", { headers: { "content-type": "image/jpeg" } })));
    const f = fixture(false, "2000-01-01T00:00:00Z");
    f.telegramApi = async () => { throw new Error("edit denied"); };
    await expect(publishCityPosterEvent(f)).rejects.toThrow("edit denied");
    expect(f.updates).toEqual([]);
    expect(f.activeMessage()).toBe(97);
  });

  it("does not send or update the ledger when controlled artwork is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    const f = fixture();
    await expect(publishCityPosterEvent(f)).rejects.toThrow("city_poster_media_fetch_failed:503");
    expect(f.calls).toEqual([]);
    expect(f.updates).toEqual([]);
    expect(f.activeMessage()).toBe(97);
  });
});
