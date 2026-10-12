import { getCurrentAuthIdentity, readAuthUserKey } from "../authSession";

/** Team persistence is available only to a trusted authenticated identity. */
export function getNamedTeamsActorUserKey(): string | null {
  const identity = getCurrentAuthIdentity();
  if (!identity || !("source" in identity)) return null;
  if (identity.source !== "trusted-telegram" && identity.source !== "trusted-provider") return null;
  const key = readAuthUserKey(identity)?.trim();
  return key || null;
}
