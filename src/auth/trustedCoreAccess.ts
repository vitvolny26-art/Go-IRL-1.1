export const supportsTrustedCoreAccess = (identity: unknown) => {
  if (!identity || typeof identity !== "object" || !("source" in identity)) return false;
  const source = (identity as { source?: unknown }).source;
  return source === "trusted-telegram" || source === "trusted-provider";
};
