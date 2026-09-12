export type SupabaseRpcErrorLike = {
  code?: string | null;
  message?: string | null;
};

type SupabaseRpcResult<T, E extends SupabaseRpcErrorLike> = {
  data: T;
  error: E | null;
};

type SupabaseRpcRetryOptions = {
  delayMs?: number;
  wait?: (delayMs: number) => Promise<void>;
};

const normalizeDiagnostic = (value: unknown) => String(value || "")
  .replace(/\s+/g, " ")
  .trim();

export const describeSupabaseRpcError = (error: SupabaseRpcErrorLike) => {
  const code = normalizeDiagnostic(error.code) || "unknown";
  const message = normalizeDiagnostic(error.message);
  return (message ? `${code}:${message}` : code).slice(0, 80);
};

export const isTransientSupabaseRpcError = (error: SupabaseRpcErrorLike) =>
  !normalizeDiagnostic(error.code);

const wait = (delayMs: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, delayMs);
});

export async function withTransientSupabaseRpcRetry<T, E extends SupabaseRpcErrorLike>(
  run: () => PromiseLike<SupabaseRpcResult<T, E>>,
  options: SupabaseRpcRetryOptions = {},
): Promise<SupabaseRpcResult<T, E>> {
  const first = await run();
  if (!first.error || !isTransientSupabaseRpcError(first.error)) return first;

  const delayMs = Math.max(0, options.delayMs ?? 150);
  if (delayMs > 0) await (options.wait || wait)(delayMs);
  return run();
}
