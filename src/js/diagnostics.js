const REDACTED = "[REDACTED]";
const CIRCULAR = "[CIRCULAR]";

const SENSITIVE_KEYS = new Set([
  "accesstoken",
  "accountid",
  "apikey",
  "authorization",
  "authtoken",
  "clientsecret",
  "cookie",
  "devicecode",
  "email",
  "idtoken",
  "pass",
  "passwd",
  "password",
  "phone",
  "phonenumber",
  "proxyauthorization",
  "refreshtoken",
  "secret",
  "sessionid",
  "setcookie",
  "token",
  "userid",
  "xapikey",
]);

const COOKIE_HEADER_PATTERN = /\b(cookie|set-cookie)(\s*:\s*)[^\r\n]*/gi;
const AUTHORIZATION_HEADER_PATTERN =
  /\b(authorization|proxy-authorization)(\s*:\s*)[^\r\n]*/gi;
const STRING_ASSIGNMENT_PATTERN =
  /\b(authorization|proxy-authorization|cookie|set-cookie|password|passwd|access_token|refresh_token|id_token|api_key|client_secret|device_code|token)(\s*[:=]\s*)(?:bearer\s+)?[^\s&,;]+/gi;

function normalizeKey(key) {
  return String(key).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSensitiveKey(key) {
  return SENSITIVE_KEYS.has(normalizeKey(key));
}

function sanitizeString(value) {
  try {
    const url = new URL(value);
    let changed = false;

    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveKey(key)) {
        url.searchParams.set(key, REDACTED);
        changed = true;
      }
    }

    if (url.username || url.password) {
      url.username = REDACTED;
      url.password = REDACTED;
      changed = true;
    }

    if (changed) {
      return url.toString();
    }
  } catch {
    // Most diagnostic strings are not URLs. Continue with text redaction.
  }

  return value
    .replace(
      AUTHORIZATION_HEADER_PATTERN,
      (_match, key, separator) => `${key}${separator}${REDACTED}`,
    )
    .replace(
      COOKIE_HEADER_PATTERN,
      (_match, key, separator) => `${key}${separator}${REDACTED}`,
    )
    .replace(
      STRING_ASSIGNMENT_PATTERN,
      (_match, key, separator) => `${key}${separator}${REDACTED}`,
    );
}

function sanitize(value, seen) {
  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "undefined") {
    return "[UNDEFINED]";
  }

  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`;
  }

  if (seen.has(value)) {
    return CIRCULAR;
  }
  seen.add(value);

  if (value instanceof Error) {
    return {
      name: sanitizeString(value.name),
      message: sanitizeString(value.message),
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitize(entry, seen));
  }

  const sanitized = {};
  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = isSensitiveKey(key)
      ? REDACTED
      : sanitize(entry, seen);
  }
  return sanitized;
}

/**
 * Return a JSON-safe copy with credentials and common personal identifiers
 * removed. This function is intentionally shared by every log level.
 */
export function sanitizeForDiagnostics(value) {
  return sanitize(value, new WeakSet());
}

/**
 * Create a newline-oriented JSON diagnostics writer.
 *
 * The sink receives exactly one serialized JSON event per call. Debug mode
 * controls verbosity only; all levels pass through the same redaction path.
 */
export function createDiagnostics({
  app = {},
  clock = () => new Date().toISOString(),
  debug = false,
  sink = (line) => console.log(line),
} = {}) {
  const safeApp = sanitizeForDiagnostics(app);

  function emit(level, event, details = {}) {
    if (level === "debug" && !debug) {
      return;
    }

    const record = {
      timestamp: clock(),
      level,
      event: sanitizeString(String(event)),
      app: safeApp,
      details: sanitizeForDiagnostics(details),
    };

    sink(JSON.stringify(record));
  }

  return Object.freeze({
    debug: (event, details) => emit("debug", event, details),
    info: (event, details) => emit("info", event, details),
    warn: (event, details) => emit("warn", event, details),
    error: (event, details) => emit("error", event, details),
  });
}
