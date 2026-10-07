import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { inspectHlsManifest } from "../src/js/hls.js";

const load = (name) => readFile(resolve("tests/fixtures/2026-10-07", name), "utf8");

test("inspects an HLS master and deduplicates equivalent mirrors", async () => {
  const result = inspectHlsManifest(await load("vod-master.m3u8"));

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.qualities, [
    {
      width: 640,
      height: 360,
      bandwidth: 289000,
      frameRate: 24,
      codecs: ["avc1.42c01f", "mp4a.40.2"],
      mirrorCount: 2,
    },
    {
      width: 1920,
      height: 1080,
      bandwidth: 1159000,
      frameRate: 24,
      codecs: ["avc1.640029", "mp4a.40.2"],
      mirrorCount: 1,
    },
  ]);
  assert.deepEqual(result.value.codecs, ["avc1.42c01f", "mp4a.40.2", "avc1.640029"]);
  assert.equal(result.value.advertisingMarked, false);
  assert.equal(result.value.encrypted, false);
});

test("recognizes structural advertising markers without rewriting the manifest", async () => {
  const manifest = await load("marker-media.m3u8");
  const result = inspectHlsManifest(manifest);

  assert.equal(result.ok, true);
  assert.equal(result.value.advertisingMarked, true);
  assert.deepEqual(result.value.markers, ["daterange", "cue-out", "discontinuity", "cue-in"]);
  assert.equal(result.value.original, manifest);
});

test("does not guess that an unrelated DATERANGE is advertising", () => {
  const manifest = [
    "#EXTM3U",
    "#EXT-X-DATERANGE:ID=\"download-window\",CLASS=\"com.example.chapter\"",
    "#EXTINF:6,",
    "segment.ts",
  ].join("\n");
  const result = inspectHlsManifest(manifest);

  assert.equal(result.ok, true);
  assert.equal(result.value.advertisingMarked, false);
  assert.deepEqual(result.value.markers, []);
});

test("detects encrypted media and rejects non-HLS input", async () => {
  const encrypted = inspectHlsManifest(await load("encrypted-media.m3u8"));
  assert.equal(encrypted.value.encrypted, true);
  assert.equal(encrypted.value.encryptionMethod, "AES-128");
  assert.equal(inspectHlsManifest("not a playlist").error.code, "manifest-unsupported");
});

test("inspects the dated live master fixture", async () => {
  const result = inspectHlsManifest(await load("live-master.m3u8"));

  assert.equal(result.ok, true);
  assert.equal(result.value.qualities.length, 2);
  assert.equal(result.value.qualities[0].mirrorCount, 2);
  assert.deepEqual(result.value.codecs, ["avc1.64001f", "mp4a.40.2"]);
});

test("reports unknown extension markers and preserves their original source", async () => {
  const manifest = await load("unknown-marker-media.m3u8");
  const result = inspectHlsManifest(manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.unknownTags, ["#EXT-X-CUSTOM-AD-BREAK"]);
  assert.equal(result.value.original, manifest);
});

test("reports multiple alternate audio tracks without exposing their locations", async () => {
  const result = inspectHlsManifest(await load("multiple-audio-master.m3u8"));

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.audioTracks, [
    { groupId: "audio", name: "Russian", language: "ru", isDefault: true, autoSelect: true },
    { groupId: "audio", name: "Original", language: "en", isDefault: false, autoSelect: true },
  ]);
  assert.doesNotMatch(JSON.stringify(result.value.audioTracks), /\.m3u8/);
});
