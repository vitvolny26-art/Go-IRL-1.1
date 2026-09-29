import { isReminderWorkerAuthorized } from "../_shared/worker-authorization.js";
import { requireEnv } from "../_shared/env.js";
import { createVercelHandler } from "../_shared/vercel-handler.js";

const BUCKET = "city-posters-media";
const MAX_BYTES = 8 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const objectPathPattern = /^[a-z0-9][a-z0-9/_-]{0,180}\.(?:jpe?g|png|webp)$/;

const json = (status: number, payload: unknown) => new Response(JSON.stringify(payload), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

export async function handleCityPostersMedia(request: Request) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (!isReminderWorkerAuthorized(request)) return json(401, { error: "unauthorized" });

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() || "";
  if (!allowedTypes.has(contentType)) return json(415, { error: "unsupported_media_type" });

  const objectPath = request.headers.get("x-city-posters-object-path")?.trim() || "";
  if (!objectPathPattern.test(objectPath) || objectPath.includes("..") || objectPath.includes("//")) {
    return json(400, { error: "invalid_object_path" });
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return json(413, { error: "invalid_media_size" });

  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const encodedPath = objectPath.split("/").map(encodeURIComponent).join("/");
  const upload = await fetch(`${supabaseUrl}/storage/v1/object/${BUCKET}/${encodedPath}`, {
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
    bucket: BUCKET,
    path: objectPath,
    publicUrl: `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${encodedPath}`,
  });
}

export default createVercelHandler(handleCityPostersMedia);
