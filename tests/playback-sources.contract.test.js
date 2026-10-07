import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { createPlaybackSources } from "../src/js/playback-sources.js";
import { createFixtureHttp } from "./helpers/fixture-http.js";

const ROOT = resolve("tests/fixtures/2026-10-07");
const fixture = (name) => resolve(ROOT, name);
const vodId = "2458766add765d8048f731ee2eaaf926";
const liveId = "0ed0696149c131d3a7349372d730d4e6";
const vodUrl = "https://media.invalid/vod/master.m3u8?expire=1893456000";
const liveUrl = "https://media.invalid/live/master.m3u8?expire=1893456000";
const playPath = (videoId) =>
  `/api/play/options/${videoId}/?no_404=true&referer=https%3A%2F%2Frutube.ru%2Ftv-release%2Fwebos.server%2Fwebos%2F&pver=v2&ver=34.0.0&ac_client=linux_tv`;

function sourcesFor(routes, options = {}) {
  return createPlaybackSources({
    http: createFixtureHttp(routes),
    clock: () => new Date("2026-10-07T00:00:00Z"),
    ...options,
  });
}

test("resolves a fresh VOD source and exposes normalized manifest capabilities", async () => {
  const routes = {};
  routes[playPath(vodId)] = fixture("play-options-vod.json");
  routes[vodUrl] = fixture("vod-master.m3u8");
  const sources = sourcesFor(routes);

  const result = await sources.resolve({ videoId: vodId });

  assert.equal(result.ok, true);
  assert.equal(result.value.kind, "vod");
  assert.equal(result.value.url, vodUrl);
  assert.equal(result.value.manifest, "hls");
  assert.equal(result.value.seekable, true);
  assert.equal(result.value.durationMs, 341718);
  assert.equal(result.value.qualities.length, 2);
  assert.deepEqual(result.value.codecs, ["avc1.42c01f", "mp4a.40.2", "avc1.640029"]);
  assert.equal(result.value.expiresAt, "2030-01-01T00:00:00.000Z");
  assert.equal(result.value.advertising, "none-observed");
  assert.deepEqual(result.value.warnings, []);
});

test("resolves live HLS, honors DVR, and classifies marked manifests", async () => {
  const routes = {};
  routes[playPath(liveId)] = fixture("play-options-live.json");
  routes[liveUrl] = fixture("marker-media.m3u8");

  const result = await sourcesFor(routes).resolve({ videoId: liveId });

  assert.equal(result.ok, true);
  assert.equal(result.value.kind, "live");
  assert.equal(result.value.seekable, true);
  assert.equal(result.value.advertising, "manifest-marked");
  assert.ok(result.value.warnings.includes("manifest-discontinuity"));
});

test("returns typed unavailable, paid, DRM, malformed, missing, and expired failures", async (t) => {
  const cases = [
    ["unavailable", "play-options-unavailable.json", "unavailable"],
    ["paid", "play-options-paid.json", "paid"],
    ["drm", "play-options-drm.json", "drm-unsupported"],
    ["malformed", "play-options-malformed.json", "malformed-response"],
  ];

  for (const [id, name, code] of cases) {
    await t.test(code, async () => {
      const path = playPath(id);
      const result = await sourcesFor({ [path]: fixture(name) }).resolve({ videoId: id });
      assert.equal(result.ok, false);
      assert.equal(result.error.code, code);
    });
  }

  const missingHttp = { json: async () => ({ ok: true, value: { has_video: true, video_balancer: {}, live_streams: {} } }) };
  assert.equal((await createPlaybackSources({ http: missingHttp }).resolve({ videoId: "missing" })).error.code, "source-missing");

  const expiredHttp = {
    json: async () => ({ ok: true, value: { has_video: true, video_balancer: { m3u8: "https://media.invalid/master.m3u8?expire=1" }, live_streams: {} } }),
  };
  assert.equal((await createPlaybackSources({ http: expiredHttp }).resolve({ videoId: "expired" })).error.code, "source-expired");
});

test("rejects manifest encryption but degrades safely when optional probing is CORS-blocked", async () => {
  const encryptedUrl = "https://media.invalid/encrypted/master.m3u8?expire=1893456000";
  const encryptedOptions = {
    ...JSON.parse(await (await import("node:fs/promises")).readFile(fixture("play-options-vod.json"), "utf8")),
    video_balancer: { m3u8: encryptedUrl },
  };
  const encryptedHttp = {
    json: async () => ({ ok: true, value: encryptedOptions }),
    text: async () => ({ ok: true, value: await (await import("node:fs/promises")).readFile(fixture("encrypted-media.m3u8"), "utf8") }),
  };
  const rejected = await createPlaybackSources({ http: encryptedHttp, clock: () => new Date("2026-10-07") }).resolve({ videoId: vodId });
  assert.equal(rejected.error.code, "drm-unsupported");

  const corsHttp = {
    json: async () => ({ ok: true, value: encryptedOptions }),
    text: async () => ({ ok: false, error: { code: "cors-rejected", operation: "manifest" } }),
  };
  const degraded = await createPlaybackSources({ http: corsHttp, clock: () => new Date("2026-10-07") }).resolve({ videoId: vodId });
  assert.equal(degraded.ok, true);
  assert.equal(degraded.value.advertising, "unknown");
  assert.deepEqual(degraded.value.warnings, ["manifest-probe-cors-rejected"]);

  const opaqueHttp = {
    json: async () => ({ ok: true, value: encryptedOptions }),
    text: async () => ({ ok: false, error: { code: "opaque-network", operation: "manifest" } }),
  };
  const opaque = await createPlaybackSources({ http: opaqueHttp, clock: () => new Date("2026-10-07") }).resolve({ videoId: vodId });
  assert.equal(opaque.ok, true);
  assert.equal(opaque.value.advertising, "unknown");
  assert.deepEqual(opaque.value.warnings, ["manifest-probe-opaque-network"]);
});

test("keeps non-CORS manifest failures typed", async () => {
  const raw = JSON.parse(await (await import("node:fs/promises")).readFile(fixture("play-options-vod.json"), "utf8"));
  for (const code of ["offline", "timeout", "http"]) {
    const error = { code, operation: "manifest-probe" };
    if (code === "http") error.status = 503;
    const result = await createPlaybackSources({
      http: {
        json: async () => ({ ok: true, value: raw }),
        text: async () => ({ ok: false, error }),
      },
      clock: () => new Date("2026-10-07"),
    }).resolve({ videoId: vodId });
    assert.deepEqual(result, { ok: false, error });
  }
});

test("rejects HLS codecs outside the initial AVC/AAC capability boundary", async () => {
  const raw = JSON.parse(await (await import("node:fs/promises")).readFile(fixture("play-options-vod.json"), "utf8"));
  const manifest = await (await import("node:fs/promises")).readFile(fixture("unsupported-codec-master.m3u8"), "utf8");
  const result = await createPlaybackSources({
    http: {
      json: async () => ({ ok: true, value: raw }),
      text: async () => ({ ok: true, value: manifest }),
    },
    clock: () => new Date("2026-10-07"),
  }).resolve({ videoId: vodId });

  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "manifest-unsupported",
      operation: "playback-source",
      formats: ["vp9", "opus"],
    },
  });
});

test("propagates cancellation and never includes signed source URLs in failures", async () => {
  const controller = new AbortController();
  controller.abort();
  const cancelled = await sourcesFor({}).resolve({ videoId: vodId, signal: controller.signal });
  assert.equal(cancelled.error.code, "cancelled");

  const failure = await createPlaybackSources({
    http: {
      json: async () => ({ ok: false, error: { code: "http", operation: "play-options", status: 503 } }),
    },
  }).resolve({ videoId: "safe-id" });
  assert.doesNotMatch(JSON.stringify(failure), /https?:\/\/|sign=|token=/i);
});

test("maps access and entitlement HTTP statuses to public source errors", async () => {
  const denied = await createPlaybackSources({
    http: { json: async () => ({ ok: false, error: { code: "http", operation: "play-options", status: 403 } }) },
  }).resolve({ videoId: "denied" });
  const payment = await createPlaybackSources({
    http: { json: async () => ({ ok: false, error: { code: "http", operation: "play-options", status: 402 } }) },
  }).resolve({ videoId: "payment" });

  assert.deepEqual(denied, { ok: false, error: { code: "unavailable", operation: "playback-source", reason: "access-denied" } });
  assert.equal(payment.error.code, "paid");
});

test("preserves playback with an unknown manifest marker and emits a warning", async () => {
  const raw = JSON.parse(await (await import("node:fs/promises")).readFile(fixture("play-options-vod.json"), "utf8"));
  const manifest = await (await import("node:fs/promises")).readFile(fixture("unknown-marker-media.m3u8"), "utf8");
  const result = await createPlaybackSources({
    http: {
      json: async () => ({ ok: true, value: raw }),
      text: async () => ({ ok: true, value: manifest }),
    },
    clock: () => new Date("2026-10-07"),
  }).resolve({ videoId: vodId });

  assert.equal(result.ok, true);
  assert.equal(result.value.url, vodUrl);
  assert.equal(result.value.advertising, "unknown");
  assert.deepEqual(result.value.warnings, ["manifest-unknown-markers"]);
});
