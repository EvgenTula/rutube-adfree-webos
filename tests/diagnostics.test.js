import assert from "node:assert/strict";
import test from "node:test";

import {
  createDiagnostics,
  sanitizeForDiagnostics,
} from "../src/js/diagnostics.js";

const FIXED_TIME = "2026-01-02T03:04:05.000Z";

function captureDiagnostics(options = {}) {
  const lines = [];
  const diagnostics = createDiagnostics({
    app: { version: "0.1.0", commit: "dev" },
    clock: () => FIXED_TIME,
    sink: (line) => lines.push(line),
    ...options,
  });

  return { diagnostics, lines };
}

test("emits a structured event with stable baseline context", () => {
  const { diagnostics, lines } = captureDiagnostics();

  diagnostics.info("app.ready", { screen: "baseline" });

  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    timestamp: FIXED_TIME,
    level: "info",
    event: "app.ready",
    app: { version: "0.1.0", commit: "dev" },
    details: { screen: "baseline" },
  });
});

test("suppresses debug events unless debug mode is enabled", () => {
  const disabled = captureDiagnostics();
  const enabled = captureDiagnostics({ debug: true });

  disabled.diagnostics.debug("player.detail", { state: "idle" });
  enabled.diagnostics.debug("player.detail", { state: "idle" });

  assert.deepEqual(disabled.lines, []);
  assert.equal(JSON.parse(enabled.lines[0]).level, "debug");
});

test("redacts credential, authentication, and personal-data fields recursively", () => {
  const input = {
    Authorization: "Bearer top-secret",
    cookie: "session=private",
    nested: {
      access_token: "access-secret",
      auth_token: "auth-secret",
      deviceCode: "device-secret",
      email: "viewer@example.test",
      safe: "kept",
    },
  };

  assert.deepEqual(sanitizeForDiagnostics(input), {
    Authorization: "[REDACTED]",
    cookie: "[REDACTED]",
    nested: {
      access_token: "[REDACTED]",
      auth_token: "[REDACTED]",
      deviceCode: "[REDACTED]",
      email: "[REDACTED]",
      safe: "kept",
    },
  });
});

test("redacts sensitive URL query values and credentials embedded in strings", () => {
  const sanitized = sanitizeForDiagnostics({
    url: "https://example.test/video?id=public&token=secret&device_code=hidden",
    header: "Authorization: Bearer abc.def.ghi",
    basicHeader: "Authorization: Basic dXNlcjpwYXNz trailing-data",
    cookieText: "Cookie: sid=private-value; viewer=personal-value",
    requestHeaders: { "x-api-key": "api-secret" },
  });

  assert.equal(
    sanitized.url,
    "https://example.test/video?id=public&token=%5BREDACTED%5D&device_code=%5BREDACTED%5D",
  );
  assert.equal(sanitized.header, "Authorization: [REDACTED]");
  assert.equal(sanitized.basicHeader, "Authorization: [REDACTED]");
  assert.equal(sanitized.cookieText, "Cookie: [REDACTED]");
  assert.deepEqual(sanitized.requestHeaders, { "x-api-key": "[REDACTED]" });
});

test("debug mode never weakens redaction", () => {
  const { diagnostics, lines } = captureDiagnostics({ debug: true });

  diagnostics.debug("request.failed", {
    status: 401,
    password: "do-not-log",
    url: "https://example.test/?api_key=do-not-log",
  });

  const output = lines[0];
  assert.doesNotMatch(output, /do-not-log/);
  assert.deepEqual(JSON.parse(output).details, {
    status: 401,
    password: "[REDACTED]",
    url: "https://example.test/?api_key=%5BREDACTED%5D",
  });
});

test("serializes Error values without stack traces", () => {
  const error = new Error("request failed for token=secret");

  assert.deepEqual(sanitizeForDiagnostics(error), {
    name: "Error",
    message: "request failed for token=[REDACTED]",
  });
});
