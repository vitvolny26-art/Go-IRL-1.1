import type { TrustedIdentityProvider, WebTrustedIdentityProvider } from "./providerTrustedSession";

export const accountSecurityFeedbackStorageKey = "go-irl-account-security-feedback-v1";

export type AccountSecurityFeedback = {
  status: "linked" | "already_linked" | "transferred" | "error";
  provider: WebTrustedIdentityProvider;
  error?: string;
};

export type LinkedProviderIdentity = {
  provider: TrustedIdentityProvider;
  status: "active" | "revoked";
  provider_username?: string | null;
  provider_email?: string | null;
  provider_display_name?: string | null;
};

const cleanDisplayValue = (value: string | null | undefined) => value?.trim() || "";

export const linkedProviderDisplayLabel = (identity: LinkedProviderIdentity) => {
  const username = cleanDisplayValue(identity.provider_username);
  const email = cleanDisplayValue(identity.provider_email);
  const displayName = cleanDisplayValue(identity.provider_display_name);
  if (identity.provider === "telegram") return username ? (username.startsWith("@") ? username : `@${username}`) : displayName;
  if (identity.provider === "google") return email || displayName;
  if (identity.provider === "facebook") return displayName || email;
  return displayName || email || username;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const writeAccountSecurityFeedback = (storage: StorageLike, feedback: AccountSecurityFeedback) => {
  storage.setItem(accountSecurityFeedbackStorageKey, JSON.stringify(feedback));
};

export const consumeAccountSecurityFeedback = (storage: StorageLike): AccountSecurityFeedback | null => {
  const raw = storage.getItem(accountSecurityFeedbackStorageKey);
  storage.removeItem(accountSecurityFeedbackStorageKey);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AccountSecurityFeedback>;
    if ((value.status !== "linked" && value.status !== "already_linked" && value.status !== "transferred" && value.status !== "error")
      || (value.provider !== "google" && value.provider !== "facebook")) return null;
    return { status: value.status, provider: value.provider, error: typeof value.error === "string" ? value.error : undefined };
  } catch {
    return null;
  }
};

export const canLinkProvider = (
  linked: readonly LinkedProviderIdentity[],
  provider: WebTrustedIdentityProvider,
) => !linked.some((identity) => identity.provider === provider && identity.status === "active");

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export async function fetchLinkedProviderIdentities(accessToken: string): Promise<LinkedProviderIdentity[]> {
  if (!supabaseUrl || !publishableKey || !accessToken.trim()) throw new Error("account_security_unavailable");
  const response = await fetch(`${supabaseUrl}/functions/v1/linkProviderIdentity`, {
    method: "GET",
    headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}` },
  });
  const payload = await response.json() as { identities?: LinkedProviderIdentity[]; error?: string };
  if (!response.ok || !Array.isArray(payload.identities)) throw new Error(payload.error || "account_security_unavailable");
  return payload.identities.filter((identity) =>
    (identity.provider === "telegram" || identity.provider === "google" || identity.provider === "facebook")
    && (identity.status === "active" || identity.status === "revoked"));
}
