export const trustedAuthRequestTimeoutMs = 8_000;
export const trustedAuthRetryCooldownMs = 15_000;

export type TrustedAuthRecovery = {
  canAttempt: () => boolean;
  markUnavailable: () => void;
  markAvailable: () => void;
  reset: () => void;
};

export const createTrustedAuthRecovery = (
  now: () => number = () => Date.now(),
  cooldownMs = trustedAuthRetryCooldownMs,
): TrustedAuthRecovery => {
  let retryAfterMs = 0;

  return {
    canAttempt: () => now() >= retryAfterMs,
    markUnavailable: () => {
      retryAfterMs = now() + cooldownMs;
    },
    markAvailable: () => {
      retryAfterMs = 0;
    },
    reset: () => {
      retryAfterMs = 0;
    },
  };
};

export const runTrustedAuthWithTimeout = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = trustedAuthRequestTimeoutMs,
): Promise<T> => {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new DOMException("Trusted auth request timed out", "AbortError"));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
};
