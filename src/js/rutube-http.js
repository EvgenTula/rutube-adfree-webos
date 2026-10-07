const DEFAULT_BASE_URL = "https://rutube.ru";
const DEFAULT_TIMEOUT_MS = 10000;

function browserIsOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function failure(code, operation, status) {
  const error = { code, operation };
  if (typeof status === "number") {
    error.status = status;
  }
  return { ok: false, error };
}

function defaultFetch() {
  if (typeof fetch !== "function") {
    throw new Error("fetch is not available");
  }
  return fetch.apply(this, arguments);
}

/**
 * Small fetch boundary for RUTUBE JSON and ephemeral manifest requests.
 * Failures deliberately omit URLs, response bodies, and native error messages.
 */
export function createRutubeHttp({
  baseUrl = DEFAULT_BASE_URL,
  fetchImpl = defaultFetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  async function request({ path, url, operation, signal, responseType }) {
    const operationName = typeof operation === "string" && /^[a-z0-9-]{1,50}$/i.test(operation)
      ? operation
      : "rutube-request";
    if (signal && signal.aborted) {
      return failure("cancelled", operationName);
    }

    const controller = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const cancel = () => controller.abort();
    if (signal) {
      signal.addEventListener("abort", cancel, { once: true });
    }

    function cleanup() {
      clearTimeout(timeout);
      if (signal) {
        signal.removeEventListener("abort", cancel);
      }
    }

    let response;
    try {
      const target = url || new URL(path, baseUrl).toString();
      response = await fetchImpl(target, {
        method: "GET",
        headers: { Accept: responseType === "json" ? "application/json" : "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain" },
        signal: controller.signal,
      });
    } catch (_error) {
      if (signal && signal.aborted) {
        return failure("cancelled", operationName);
      }
      if (timedOut) {
        return failure("timeout", operationName);
      }
      // Fetch intentionally does not reveal whether an opaque rejection came
      // from DNS, routing, TLS, or CORS. Do not manufacture a CORS diagnosis.
      return failure(browserIsOffline() ? "offline" : "opaque-network", operationName);
    } finally {
      if (!response) cleanup();
    }

    if (!response || response.ok !== true) {
      cleanup();
      return failure("http", operationName, response && response.status);
    }

    try {
      const value = responseType === "json" ? await response.json() : await response.text();
      return { ok: true, value };
    } catch (_error) {
      if (signal && signal.aborted) return failure("cancelled", operationName);
      if (timedOut) return failure("timeout", operationName);
      return failure("malformed-response", operationName);
    } finally {
      cleanup();
    }
  }

  return Object.freeze({
    json(options) {
      return request({ ...options, responseType: "json" });
    },
    text(options) {
      return request({ ...options, responseType: "text" });
    },
  });
}
