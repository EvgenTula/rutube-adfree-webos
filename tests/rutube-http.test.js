import assert from "node:assert/strict";
import test from "node:test";

import { createRutubeHttp } from "../src/js/rutube-http.js";

test("fetch adapter decodes JSON and omits request URLs from typed HTTP failures", async () => {
  const success = createRutubeHttp({
    fetchImpl: async () => ({ ok: true, json: async () => ({ value: 1 }) }),
  });
  assert.deepEqual(await success.json({ path: "/ok", operation: "catalog" }), { ok: true, value: { value: 1 } });

  const failed = createRutubeHttp({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  const result = await failed.json({ path: "/private?sign=supersecret", operation: "catalog" });
  assert.deepEqual(result, { ok: false, error: { code: "http", operation: "catalog", status: 503 } });
  assert.doesNotMatch(JSON.stringify(result), /supersecret|private/);

  const unsafeOperation = await failed.json({
    path: "/private?sign=supersecret",
    operation: "GET https://private.invalid/?sign=supersecret",
  });
  assert.equal(unsafeOperation.error.operation, "rutube-request");
  assert.doesNotMatch(JSON.stringify(unsafeOperation), /supersecret|private/);
});

test("fetch adapter classifies caller cancellation", async () => {
  const http = createRutubeHttp({
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }),
    timeoutMs: 1000,
  });
  const controller = new AbortController();
  const pending = http.json({ path: "/slow", operation: "catalog", signal: controller.signal });
  controller.abort();
  assert.equal((await pending).error.code, "cancelled");
});

test("fetch adapter classifies timeouts and opaque network failures without leaking messages", async () => {
  const timeoutHttp = createRutubeHttp({
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(Object.assign(new Error("timeout"), { name: "AbortError" })));
    }),
    timeoutMs: 5,
  });
  assert.equal((await timeoutHttp.text({ url: "https://media.invalid/signed?token=secret", operation: "manifest" })).error.code, "timeout");

  const networkHttp = createRutubeHttp({
    fetchImpl: async () => { throw new TypeError("Failed https://media.invalid/?sign=secret"); },
  });
  const result = await networkHttp.text({ url: "https://media.invalid/?sign=secret", operation: "manifest" });
  assert.deepEqual(result, { ok: false, error: { code: "opaque-network", operation: "manifest" } });
  assert.doesNotMatch(JSON.stringify(result), /secret|media\.invalid/);
});
