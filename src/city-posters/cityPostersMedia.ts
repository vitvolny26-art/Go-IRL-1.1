const canonicalMediaOrigins = new Set(["https://go-irl.fun", "https://go-irl-1-1.vercel.app"]);

export function normalizeCityPostersMediaUrl(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  if (raw.startsWith("/afishi/")) return raw;
  try {
    const url = new URL(raw);
    if (canonicalMediaOrigins.has(url.origin) && url.pathname.startsWith("/afishi/")) {
      return `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {
    return raw;
  }
  return raw;
}
