type SupabaseServiceRoleClaims = {
  exp?: number;
  iss?: string;
  role?: string;
};

const base64UrlDecode = (value: string) => {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return new Uint8Array([...binary].map((char) => char.charCodeAt(0)));
};

export async function verifySupabaseServiceRoleJwt(
  token: string | null,
  jwtSecret: string,
  nowMs = Date.now(),
) {
  if (!token || !jwtSecret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0]))) as { alg?: string };
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1]))) as SupabaseServiceRoleClaims;
    if (
      header.alg !== "HS256"
      || claims.iss !== "supabase"
      || claims.role !== "service_role"
      || !claims.exp
      || claims.exp <= nowMs / 1000
    ) return false;

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return false;
  }
}
