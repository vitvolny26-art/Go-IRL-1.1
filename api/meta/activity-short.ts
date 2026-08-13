import { createClient } from "@supabase/supabase-js";
import { readEnv } from "../_shared/env.js";

type VercelRequest = { method?: string; query?: Record<string, string | string[] | undefined> };
type VercelResponse = { end(body?: string): void; setHeader(name: string, value: string): void; status(code: number): VercelResponse };

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
const aliasPattern = /^[a-z0-9-]{1,18}_([0-9a-f]{8})$/i;
const publicAppOrigin = "https://go-irl.fun";

export const activityIdPrefixFromAlias = (value: unknown) => {
  if (typeof value !== "string") return null;
  return value.trim().toLowerCase().match(aliasPattern)?.[1] || null;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return response.status(405).end("method_not_allowed");
  }

  const alias = first(request.query?.alias);
  const prefix = activityIdPrefixFromAlias(alias);
  const url = readEnv("SUPABASE_URL") || readEnv("VITE_SUPABASE_URL");
  const key = readEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!prefix || !url || !key) return response.status(404).end("not_found");

  try {
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const lowerId = `${prefix}-0000-0000-0000-000000000000`;
    const upperId = `${prefix}-ffff-ffff-ffff-ffffffffffff`;
    const { data, error } = await db
      .from("activities")
      .select("id")
      .in("visibility", ["public", "invite"])
      .gte("id", lowerId)
      .lte("id", upperId)
      .limit(2);
    if (error || !data || data.length !== 1 || typeof data[0]?.id !== "string") {
      return response.status(404).end("not_found");
    }

    const target = new URL(`/e/${encodeURIComponent(data[0].id)}`, publicAppOrigin);
    for (const [keyName, rawValue] of Object.entries(request.query || {})) {
      if (keyName === "alias") continue;
      const value = first(rawValue);
      if (value) target.searchParams.set(keyName, value);
    }
    response.setHeader("Location", target.toString());
    response.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return response.status(302).end();
  } catch {
    return response.status(404).end("not_found");
  }
}
