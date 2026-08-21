export type ProviderDisplayMetadata = {
  providerEmail: string | null;
  providerDisplayName: string | null;
};

type IdentityLike = {
  provider?: string | null;
  identity_data?: Record<string, unknown> | null;
};

type UserLike = {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  identities?: IdentityLike[] | null;
};

const readString = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : null;

const normalizeEmail = (value: string | null) => value ? value.toLowerCase() : null;

export const readProviderDisplayMetadata = (user: UserLike, provider: "google" | "facebook"): ProviderDisplayMetadata => {
  const identity = user.identities?.find((candidate) => candidate.provider === provider) || null;
  const identityData = identity?.identity_data || {};
  const userMetadata = user.user_metadata || {};
  const providerEmail = normalizeEmail(
    readString(identityData.email)
      || readString(user.email)
      || readString(userMetadata.email),
  );
  const providerDisplayName = readString(identityData.full_name)
    || readString(identityData.name)
    || readString(userMetadata.full_name)
    || readString(userMetadata.name);
  return { providerEmail, providerDisplayName };
};
