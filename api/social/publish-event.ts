import { createClient } from "@supabase/supabase-js";
import { productionAdminAuthorizationDependencies, runAuthorizedAdminAction } from "../_shared/admin-authorization.js";
import { readEnv, requireEnv } from "../_shared/env.js";
import { createVercelHandler } from "../_shared/vercel-handler.js";

type Language = "ru" | "uk" | "cs" | "en";
type Target = "facebook" | "instagram";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const graph = (host: string, path: string) => `https://${host}/${readEnv("META_GRAPH_VERSION") || "v23.0"}/${path}`;

async function post(url: string, token: string, data: Record<string, string>) {
  const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data) });
  const body = await response.json().catch(() => ({})) as { id?: string; error?: { code?: number } };
  if (!response.ok || body.error || !body.id) throw new Error(`social_publish_graph_failed:${body.error?.code || response.status}`);
  return body.id;
}

async function publish(input: { eventId: string; language: Language; targets: Target[] }) {
  const origin = `https://${(readEnv("VERCEL_PROJECT_PRODUCTION_URL") || requireEnv("VERCEL_URL")).replace(/^https?:\/\//, "")}`;
  const db = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.from("activities").select("title_ru,title_cs,event_date,event_time,address,price,visibility").eq("id", input.eventId).maybeSingle();
  if (error || !data || (data.visibility !== "public" && data.visibility !== "invite")) throw new Error("social_publish_event_not_found");
  const title = input.language === "cs" ? data.title_cs : data.title_ru;
  const eventUrl = `${origin}/api/meta/event-preview?event=${encodeURIComponent(input.eventId)}&language=${input.language}`;
  const text = [title, "", `${data.event_date} · ${String(data.event_time).slice(0, 5)}`, data.address, data.price > 0 ? `${data.price} Kč` : "Бесплатно", "", eventUrl].filter(Boolean).join("\n");
  const result: Record<string, string> = {};
  if (input.targets.includes("facebook")) {
    result.facebookPostId = await post(graph("graph.facebook.com", `${readEnv("FACEBOOK_PAGE_PUBLISH_ID") || requireEnv("MESSENGER_PAGE_ID")}/feed`), readEnv("FACEBOOK_PAGE_PUBLISH_ACCESS_TOKEN") || requireEnv("MESSENGER_PAGE_ACCESS_TOKEN"), { message: text, link: eventUrl });
  }
  if (input.targets.includes("instagram")) {
    const account = requireEnv("INSTAGRAM_ACCOUNT_ID");
    const host = readEnv("INSTAGRAM_API_MODE") === "instagram_login" ? "graph.instagram.com" : "graph.facebook.com";
    const imageUrl = `${origin}/branding/go-irl-logo.jpg`;
    const containerId = await post(graph(host, `${account}/media`), requireEnv("INSTAGRAM_ACCESS_TOKEN"), { image_url: imageUrl, caption: text });
    result.instagramMediaId = await post(graph(host, `${account}/media_publish`), requireEnv("INSTAGRAM_ACCESS_TOKEN"), { creation_id: containerId });
  }
  return result;
}

export async function handleSocialPublishEvent(request: Request) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const raw = await request.json().catch(() => null) as Record<string, unknown> | null;
  const eventId = typeof raw?.eventId === "string" ? raw.eventId.trim() : "";
  const language: Language = raw?.language === "ru" || raw?.language === "uk" || raw?.language === "cs" || raw?.language === "en" ? raw.language : "cs";
  const targets = Array.isArray(raw?.targets) ? [...new Set(raw.targets.filter((item): item is Target => item === "facebook" || item === "instagram"))] : ["facebook", "instagram"] as Target[];
  if (!uuid.test(eventId) || !targets.length) return json(400, { error: "invalid_request" });
  const authorized = await runAuthorizedAdminAction(request, productionAdminAuthorizationDependencies(), () => publish({ eventId, language, targets }));
  return authorized.ok ? json(200, { eventId, ...authorized.value }) : json(authorized.status, { error: authorized.error });
}

export default createVercelHandler(handleSocialPublishEvent);
