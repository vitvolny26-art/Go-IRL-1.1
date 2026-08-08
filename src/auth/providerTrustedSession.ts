export type TrustedIdentityProvider = "telegram" | "google" | "facebook";
export type WebTrustedIdentityProvider = Exclude<TrustedIdentityProvider, "telegram">;

export type ProviderTrustedUser<Role extends string = string> = {
  id: string;
  userKey: string;
  provider: TrustedIdentityProvider;
  providerUserId: string;
  telegramId?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  role: Role;
};

export type ProviderTrustedSession<Role extends string = string> = {
  accessToken: string;
  expiresAt: number;
  user: ProviderTrustedUser<Role>;
  source: "trusted-provider";
};

export type TelegramTrustedSessionLike<Role extends string = string> = {
  accessToken: string;
  expiresAt: number;
  user: {
    id: string;
    userKey: string;
    telegramId: number;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    role: Role;
  };
};

export type WebProviderBootstrap<Role extends string = string> = {
  accessToken: string;
  expiresAt: number;
  user: {
    id: string;
    userKey: string;
    provider: WebTrustedIdentityProvider;
    providerUserId: string;
    firstName?: string | null;
    lastName?: string | null;
    username?: string | null;
    role: Role;
  };
};

const requireNonEmpty = (value: string, field: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error(`invalid_trusted_session:${field}`);
  return normalized;
};

const requireFutureExpiry = (expiresAt: number, nowSeconds: number) => {
  if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds + 60) {
    throw new Error("invalid_trusted_session:expiresAt");
  }
  return expiresAt;
};

export function normalizeTelegramTrustedSession<Role extends string>(
  session: TelegramTrustedSessionLike<Role>,
  nowSeconds = Math.floor(Date.now() / 1000),
): ProviderTrustedSession<Role> {
  const telegramId = session.user.telegramId;
  if (!Number.isSafeInteger(telegramId) || telegramId <= 0) {
    throw new Error("invalid_trusted_session:telegramId");
  }

  return {
    accessToken: requireNonEmpty(session.accessToken, "accessToken"),
    expiresAt: requireFutureExpiry(session.expiresAt, nowSeconds),
    user: {
      id: requireNonEmpty(session.user.id, "user.id"),
      userKey: requireNonEmpty(session.user.userKey, "user.userKey"),
      provider: "telegram",
      providerUserId: String(telegramId),
      telegramId,
      firstName: session.user.firstName ?? null,
      lastName: session.user.lastName ?? null,
      username: session.user.username ?? null,
      role: session.user.role,
    },
    source: "trusted-provider",
  };
}

export function createWebProviderTrustedSession<Role extends string>(
  bootstrap: WebProviderBootstrap<Role>,
  nowSeconds = Math.floor(Date.now() / 1000),
): ProviderTrustedSession<Role> {
  return {
    accessToken: requireNonEmpty(bootstrap.accessToken, "accessToken"),
    expiresAt: requireFutureExpiry(bootstrap.expiresAt, nowSeconds),
    user: {
      id: requireNonEmpty(bootstrap.user.id, "user.id"),
      userKey: requireNonEmpty(bootstrap.user.userKey, "user.userKey"),
      provider: bootstrap.user.provider,
      providerUserId: requireNonEmpty(bootstrap.user.providerUserId, "user.providerUserId"),
      firstName: bootstrap.user.firstName ?? null,
      lastName: bootstrap.user.lastName ?? null,
      username: bootstrap.user.username ?? null,
      role: bootstrap.user.role,
    },
    source: "trusted-provider",
  };
}
