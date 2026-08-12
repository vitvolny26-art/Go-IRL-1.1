const DEFAULT_RELIABILITY_POLICY = Object.freeze({
  timeout_ms: 30_000,
  max_attempts: 3,
  base_backoff_ms: 500,
  max_backoff_ms: 2_000,
});

const TRANSPORT_MODES = new Set(['test', 'production']);
const RETRYABLE_ERROR_CODES = new Set([
  'BRIDGE_SSH_UNAVAILABLE',
  'BRIDGE_TIMEOUT',
  'RUNTIME_BUSY',
  'BRIDGE_PARTIAL_RESPONSE',
]);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function invalidRequest(message) {
  const error = new Error(message);
  error.code = 'INVALID_BRIDGE_REQUEST';
  return error;
}

function requireIdentifier(value, name) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    throw invalidRequest(`${name} must be a bounded transport identifier.`);
  }
  return value;
}

function requireBoundedInteger(value, name, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw invalidRequest(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return value;
}

function normalizeTransportMeta(value) {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw invalidRequest('_meta must be a JSON object.');
  }
  const allowed = new Set(['correlation_id', 'execution_id', 'mode', 'attempt', 'max_attempts']);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw invalidRequest('_meta contains an unsupported field.');
  }
  if (!TRANSPORT_MODES.has(value.mode)) {
    throw invalidRequest('_meta.mode must be test or production.');
  }
  const maxAttempts = value.max_attempts === undefined
    ? DEFAULT_RELIABILITY_POLICY.max_attempts
    : requireBoundedInteger(value.max_attempts, '_meta.max_attempts', 1, DEFAULT_RELIABILITY_POLICY.max_attempts);
  const attempt = value.attempt === undefined
    ? 1
    : requireBoundedInteger(value.attempt, '_meta.attempt', 1, maxAttempts);
  return {
    correlation_id: requireIdentifier(value.correlation_id, '_meta.correlation_id'),
    execution_id: requireIdentifier(value.execution_id, '_meta.execution_id'),
    mode: value.mode,
    attempt,
    max_attempts: maxAttempts,
  };
}

function safeTransportMeta(value) {
  try {
    return normalizeTransportMeta(value);
  } catch {
    return null;
  }
}

function publicTransport(meta) {
  if (!meta) return null;
  return {
    correlation_id: meta.correlation_id,
    execution_id: meta.execution_id,
    mode: meta.mode,
  };
}

function retryDelay(attempt) {
  return Math.min(
    DEFAULT_RELIABILITY_POLICY.base_backoff_ms * (2 ** Math.max(0, attempt - 1)),
    DEFAULT_RELIABILITY_POLICY.max_backoff_ms,
  );
}

function reliabilityEnvelope({ errorCode = null, meta = null } = {}) {
  const attempt = meta?.attempt || 1;
  const maxAttempts = meta?.max_attempts || 1;
  const classifiedRetryable = Boolean(errorCode && RETRYABLE_ERROR_CODES.has(errorCode));
  const retryable = classifiedRetryable && attempt < maxAttempts;
  return {
    timeout_ms: DEFAULT_RELIABILITY_POLICY.timeout_ms,
    attempt,
    max_attempts: maxAttempts,
    retryable,
    retry_after_ms: retryable ? retryDelay(attempt) : null,
    dead_lettered: Boolean(errorCode && !retryable),
  };
}

module.exports = {
  DEFAULT_RELIABILITY_POLICY,
  RETRYABLE_ERROR_CODES,
  normalizeTransportMeta,
  publicTransport,
  reliabilityEnvelope,
  safeTransportMeta,
};
