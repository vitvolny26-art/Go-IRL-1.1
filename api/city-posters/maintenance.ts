import { requireEnv } from "../_shared/env.js";
import { isReminderWorkerAuthorized } from "../_shared/worker-authorization.js";
import { createVercelHandler } from "../_shared/vercel-handler.js";

const MEDIA_BUCKET = "city-posters-media";
const MAX_MEDIA_BYTES = 8 * 1024 * 1024;
const allowedMediaTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const mediaPathPattern = /^[a-z0-9][a-z0-9/_-]{0,180}\.(?:jpe?g|png|webp)$/;

const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

async function uploadCityPostersMedia(request: Request, serviceRoleKey: string) {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() || "";
  if (!allowedMediaTypes.has(contentType)) return json(415, { error: "unsupported_media_type" });

  const objectPath = request.headers.get("x-city-posters-object-path")?.trim() || "";
  if (!mediaPathPattern.test(objectPath) || objectPath.includes("..") || objectPath.includes("//")) {
    return json(400, { error: "invalid_object_path" });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) return json(413, { error: "invalid_media_size" });

  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  const upload = await fetch(`${supabaseUrl}/storage/v1/object/${MEDIA_BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": contentType,
      "cache-control": "3600",
      "x-upsert": "false",
    },
    body: bytes,
  });

  if (!upload.ok) {
    const detail = await upload.text().catch(() => "");
    return json(upload.status, { error: "storage_upload_failed", detail: detail.slice(0, 300) });
  }

  return json(201, {
    bucket: MEDIA_BUCKET,
    path: objectPath,
    publicUrl: `${supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${encodedPath}`,
  });
}

export async function handleCityPostersMaintenance(request: Request) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!isReminderWorkerAuthorized(request)) return json(401, { error: "unauthorized" });

  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (request.headers.has("x-city-posters-object-path")) {
    return uploadCityPostersMedia(request, serviceRoleKey);
  }

  const body = await request.json().catch(() => ({})) as { limit?: number };
  const limit = Number.isInteger(body.limit) ? Math.max(1, Math.min(Number(body.limit), 200)) : 100;

  const response = await fetch(`${requireEnv("SUPABASE_URL")}/functions/v1/telegramEventSupergroup`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "maintain_city_poster_publications", limit }),
  });
  const payload = await response.text();
  return new Response(payload, {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export default createVercelHandler(handleCityPostersMaintenance);
