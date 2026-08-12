export type DeletedIdentityProvider = 'telegram' | 'google' | 'facebook';

export async function hashProviderIdentitySubject(provider: DeletedIdentityProvider, subject: string) {
  const value = `${provider}:${subject.trim()}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
