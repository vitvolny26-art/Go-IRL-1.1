import { readEnv, requireEnv } from "./env.js";

export type AdminAuthorizationLogger = (event: "admin_login_allowed" | "admin_login_denied", details: {
  reason: string;
}) => void;

export type AdminRole = "admin" | "superadmin";

type AdminJwtClaims = {
  aud?: string;
  exp?: number;
  iss?: string;
  role?: string;
  sub?: string;
  go_irl_role?: string;
  go_irl_user_key?: string;
};

type AdminJwtVerificationResult =
  | { ok: true; claims: AdminJwtClaims }
  | {
    ok: false;
    reason:
      | "malformed_session"
      | "invalid_jwt_header"
      | "invalid_jwt_encoding"
      | "signature_mismatch"
      | "invalid_jwt_payload";
  };

export type AdminAuthorizationDependencies = {
  allowedUserKeys: ReadonlySet<string>;
  issuer: string;
  jwtSecret: string;
  loadRole: (userKey: string, accessToken: string) => Promise<string | null>;
  logger?: AdminAuthorizationLogger;
  nowSeconds?: number;
};

export type AuthorizedAdmin = { ok: true; userKey: string; subject: string; role: AdminRole };
export type DeniedAdmin = { ok: false; status: 401 | 403; error: "access_denied" };

export type AdminAuthorizationResult = AuthorizedAdmin | DeniedAdmin;

export type AdminActionResult<T> =
  | { ok: true; authorization: AuthorizedAdmin; value: T }
  | DeniedAdmin;

const deny = (status: 401 | 403, reason: string, logger?: AdminAuthorizationLogger): DeniedAdmin => {
  logger?.("admin_login_denied", { reason });
  return { ok: false, status, error: "access_denied" };
};

export const isAdminRole = (role: string | null | undefined): role is AdminRole =>
  role === "admin" || role === "superadmin";

const base64UrlToBytes = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const decodeJson = <T>(value: string): T => {
  const bytes = base64UrlToBytes(value);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
};

async function verifyAdminJwt(token: string, secret: string): Promise<AdminJwtVerificationResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed_session" };

  let header: { alg?: string; typ?: string };
  try {
    header = decodeJson<{ alg?: string; typ?: string }>(parts[0]);
  } catch {
    return { ok: false, reason: "invalid_jwt_encoding" };
  }
  if (header.alg !== "HS256" || header.typ !== "JWT") {
    return { ok: false, reason: "invalid_jwt_header" };
  }

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!valid) return { ok: false, reason: "signature_mismatch" };
  } catch {
    return { ok: false, reason: "invalid_jwt_encoding" };
  }

  try {
    return { ok: true, claims: decodeJson<AdminJwtClaims>(parts[1]) };
  } catch {
    return { ok: false, reason: "invalid_jwt_payload" };
  }
}

export async function authorizeAdminRequest(
  request: Request,
  dependencies: AdminAuthorizationDependencies,
): Promise<AdminAuthorizationResult> {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return deny(401, "missing_bearer", dependencies.logger);

  const verification = await verifyAdminJwt(token, dependencies.jwtSecret);
  if (verification.ok === false) return deny(401, verification.reason, dependencies.logger);
  const { claims } = verification;

  const now = dependencies.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!claims.exp || claims.exp <= now) return deny(401, "expired_session", dependencies.logger);
  if (
    claims.iss !== dependencies.issuer
    || claims.aud !== "authenticated"
    || claims.role !== "authenticated"
    || !claims.sub
  ) {
    return deny(403, "invalid_claims", dependencies.logger);
  }
  if (
    !claims.go_irl_user_key
    || !dependencies.allowedUserKeys.has(claims.go_irl_user_key)
    || !isAdminRole(claims.go_irl_role)
  ) {
    return deny(403, "identity_not_allowed", dependencies.logger);
  }

  let currentRole: string | null;
  try {
    currentRole = await dependencies.loadRole(claims.go_irl_user_key, token);
  } catch {
    return deny(403, "role_lookup_failed", dependencies.logger);
  }
  if (!isAdminRole(currentRole) || currentRole !== claims.go_irl_role) {
    return deny(403, "role_not_allowed", dependencies.logger);
  }

  dependencies.logger?.("admin_login_allowed", { reason: "authorized" });
  return { ok: true, userKey: claims.go_irl_user_key, subject: claims.sub, role: currentRole };
}

export async function runAuthorizedAdminAction<T>(
  request: Request,
  dependencies: AdminAuthorizationDependencies,
  action: (authorization: AuthorizedAdmin) => Promise<T> | T,
): Promise<AdminActionResult<T>> {
  const authorization = await authorizeAdminRequest(request, dependencies);
  if ("status" in authorization) return authorization;
  return { ok: true, authorization, value: await action(authorization) };
}

export const productionRoleLoader = async (userKey: string, _accessToken: string, fetcher: typeof fetch = fetch) => {
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const response = await fetcher(
    `${requireEnv("SUPABASE_URL")}/rest/v1/user_roles?select=role&user_key=eq.${encodeURIComponent(userKey)}&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        accept: "application/json",
      },
    },
  );
  if (!response.ok) throw new Error("admin_role_lookup_failed");
  const rows = await response.json() as Array<{ role?: string }>;
  return rows[0]?.role || null;
};

export const parseAdminUserKeys = (value: string) => new Set(
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
);

const productionAdminUserKeys = () => {
  const configuredKeys = readEnv("GO_IRL_ADMIN_USER_KEYS") || requireEnv("GO_IRL_ADMIN_USER_KEY");
  const allowedUserKeys = parseAdminUserKeys(configuredKeys);
  if (allowedUserKeys.size === 0) throw new Error("missing_environment:GO_IRL_ADMIN_USER_KEYS");
  return allowedUserKeys;
};

export const productionAdminAuthorizationDependencies = (): AdminAuthorizationDependencies => ({
  allowedUserKeys: productionAdminUserKeys(),
  issuer: "go-irl-supabase-edge",
  jwtSecret: requireEnv("GO_IRL_JWT_SECRET"),
  loadRole: productionRoleLoader,
  logger: (event, details) => {
    if (event === "admin_login_allowed") console.info(event, details);
    else console.warn(event, details);
  },
});
