import assert from "node:assert/strict";
import test from "node:test";

import { createNativeMediaAdapter, createPlayer } from "../src/js/player.js";
import { createFakeMediaAdapter } from "./helpers/fake-media-adapter.js";

const source = (overrides = {}) => ({
  kind: "vod",
  url: "https://media.invalid/master.m3u8?sign=never-log-this",
  manifest: "hls",
  seekable: true,
  durationMs: 120000,
  qualities: [{ width: 1920, height: 1080, bandwidth: 4500000, frameRate: 25, codecs: ["avc1.640029"] }],
  codecs: ["avc1.640029", "mp4a.40.2"],
  advertising: "none-observed",
  warnings: [],
  ...overrides,
});

function harness(options = {}) {
  const media = options.media || createFakeMediaAdapter();
  const diagnosticEvents = [];
  const visibility = options.visibility || createVisibilitySource();
  const player = createPlayer({
    media,
    visibilitySource: visibility,
    startTimeoutMs: options.startTimeoutMs || 100,
    clock: options.clock,
    diagnostics: {
      debug: (event, details) => diagnosticEvents.push({ level: "debug", event, details }),
      info: (event, details) => diagnosticEvents.push({ level: "info", event, details }),
      warn: (event, details) => diagnosticEvents.push({ level: "warn", event, details }),
      error: (event, details) => diagnosticEvents.push({ level: "error", event, details }),
    },
  });
  return { player, media, visibility, diagnosticEvents };
}

function createVisibilitySource() {
  const listeners = new Set();
  return {
    hidden: false,
    addEventListener(name, listener) {
      if (name === "visibilitychange") listeners.add(listener);
    },
    removeEventListener(name, listener) {
      if (name === "visibilitychange") listeners.delete(listener);
    },
    setHidden(hidden) {
      this.hidden = hidden;
      for (const listener of Array.from(listeners)) listener();
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

async function openPlaying(subject, playbackSource = source()) {
  const pending = subject.player.open(playbackSource);
  subject.media.emit("loadedmetadata", { durationSeconds: playbackSource.durationMs / 1000 });
  subject.media.emit("playing", { paused: false, readyState: 4 });
  const result = await pending;
  assert.equal(result.ok, true);
  return result.value;
}

test("open owns loading-to-playing transitions and returns immutable URL-free snapshots", async () => {
  const subject = harness();
  const seen = [];
  const unsubscribe = subject.player.subscribe((snapshot) => seen.push(snapshot));

  const pending = subject.player.open(source());
  assert.equal(subject.player.snapshot().state, "loading");
  subject.media.emit("loadedmetadata", { durationSeconds: 120 });
  assert.equal(subject.player.snapshot().state, "ready");
  subject.media.emit("playing", { paused: false, readyState: 4 });
  const opened = await pending;

  assert.equal(opened.ok, true);
  assert.equal(opened.value.state, "playing");
  assert.equal(opened.value.qualityMode, "auto");
  assert.equal(Object.isFrozen(opened.value), true);
  assert.equal(Object.isFrozen(opened.value.qualities), true);
  assert.doesNotMatch(JSON.stringify(seen), /media\.invalid|never-log-this/);
  assert.doesNotMatch(JSON.stringify(subject.diagnosticEvents), /media\.invalid|never-log-this/);

  unsubscribe();
  assert.equal(subject.player.close("back").state, "closed");
});

test("buffering, pause, play, time, volume, ended, and close have deterministic snapshots", async () => {
  const subject = harness();
  await openPlaying(subject);

  subject.media.emit("waiting");
  assert.equal(subject.player.snapshot().state, "buffering");
  subject.media.emit("playing", { paused: false });
  assert.equal(subject.player.command("pause").ok, true);
  assert.equal(subject.player.snapshot().state, "paused");
  assert.equal(subject.player.command("play").ok, true);
  subject.media.emit("playing", { paused: false });
  subject.media.emit("seeking");
  assert.equal(subject.player.snapshot().state, "buffering");
  subject.media.emit("seeked");
  assert.equal(subject.player.snapshot().state, "playing");
  subject.media.emit("seeking");
  subject.player.command("pause");
  subject.media.emit("seeked");
  assert.equal(subject.player.snapshot().state, "paused");
  subject.player.command("play");
  subject.media.emit("playing", { paused: false });
  subject.media.emit("timeupdate", { currentTimeSeconds: 15 });
  assert.equal(subject.player.snapshot().positionMs, 15000);
  subject.media.emit("volumechange", { volume: 0.4, muted: true });
  assert.equal(subject.player.snapshot().volume, 0.4);
  assert.equal(subject.player.snapshot().muted, true);

  subject.media.emit("ended", { ended: true, paused: true });
  assert.equal(subject.player.snapshot().state, "ended");
  assert.equal(subject.media.listenerCount(), 0);
  assert.equal(subject.visibility.listenerCount(), 0);
  assert.equal(subject.media.calls.unload, 1);
  assert.equal(subject.player.close("ended").state, "closed");
  assert.equal(subject.player.close("ended").state, "closed");
  assert.equal(subject.media.calls.unload, 1);
});

test("source replacement cancels an in-flight open and does not retain media listeners", async () => {
  const subject = harness();
  const first = subject.player.open(source());
  const second = subject.player.open(source({ kind: "live", seekable: false, durationMs: undefined }));

  assert.deepEqual(await first, {
    ok: false,
    error: { code: "cancelled", operation: "player-open", reason: "source-replaced" },
  });
  assert.equal(subject.media.calls.unload, 1);
  assert.equal(subject.media.listenerCount(), subject.media.eventNames.length);

  subject.media.emit("playing", { paused: false, readyState: 4 });
  assert.equal((await second).ok, true);
  subject.player.close("back");
  assert.equal(subject.media.listenerCount(), 0);
});

test("open reports autoplay rejection, start timeout, expiry, and native failure without leaking URLs", async (t) => {
  await t.test("autoplay", async () => {
    const media = createFakeMediaAdapter({ playError: Object.assign(new Error("blocked"), { name: "NotAllowedError" }) });
    const subject = harness({ media });
    const result = await subject.player.open(source());
    assert.equal(result.error.code, "autoplay-rejected");
    assert.equal(subject.player.snapshot().state, "error");
  });

  await t.test("timeout", async () => {
    const subject = harness({ startTimeoutMs: 5 });
    const result = await subject.player.open(source());
    assert.equal(result.error.code, "timeout");
    assert.equal(subject.media.calls.unload, 1);
  });

  await t.test("already expired", async () => {
    const subject = harness({ clock: () => new Date("2030-01-01T00:00:01Z").getTime() });
    const result = await subject.player.open(source({ expiresAt: "2030-01-01T00:00:00Z" }));
    assert.equal(result.error.code, "source-expired");
    assert.equal(subject.media.calls.load, 0);
  });

  await t.test("native error", async () => {
    const subject = harness();
    const pending = subject.player.open(source());
    subject.media.emit("error", { nativeCode: 3 });
    const result = await pending;
    assert.equal(result.error.code, "playback-failed");
    assert.equal(result.error.nativeCode, 3);
    assert.doesNotMatch(JSON.stringify(result), /media\.invalid|never-log-this/);
  });

  await t.test("pause while opening", async () => {
    const subject = harness({ startTimeoutMs: 20 });
    const pending = subject.player.open(source());
    const pause = subject.player.command("pause");
    assert.equal(pause.ok, false);
    assert.deepEqual(pause.error, { code: "invalid-state", operation: "player-command", state: "loading" });
    subject.media.emit("playing", { paused: false, readyState: 4 });
    assert.equal((await pending).ok, true);
  });
});

test("seek clamps VOD and DVR positions while non-DVR live seek is rejected", async () => {
  const vod = harness();
  await openPlaying(vod);
  vod.media.emit("timeupdate", { currentTimeSeconds: 110, durationSeconds: 120 });
  assert.equal(vod.player.command({ type: "seekBy", offsetMs: 30000 }).ok, true);
  assert.equal(vod.media.state.currentTimeSeconds, 120);
  assert.equal(vod.player.command({ type: "seekTo", positionMs: -100 }).ok, true);
  assert.equal(vod.media.state.currentTimeSeconds, 0);

  const dvr = harness();
  await openPlaying(dvr, source({ kind: "live", durationMs: undefined }));
  dvr.media.emit("progress", { durationSeconds: Infinity, seekableRanges: [[50, 80]] });
  assert.equal(dvr.player.command({ type: "seekTo", positionMs: 1000 }).ok, true);
  assert.equal(dvr.media.state.currentTimeSeconds, 50);

  const live = harness();
  await openPlaying(live, source({ kind: "live", seekable: false, durationMs: undefined }));
  const rejected = live.player.command({ type: "seekBy", offsetMs: -10000 });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "seek-unsupported");
});

test("native automatic HLS is explicit and manual quality selection is unsupported", async () => {
  const subject = harness();
  await openPlaying(subject);

  assert.equal(subject.player.command({ type: "selectQuality", quality: "auto" }).ok, true);
  const manual = subject.player.command({ type: "selectQuality", quality: { height: 1080 } });
  assert.deepEqual(manual.error, {
    code: "quality-unsupported",
    operation: "player-command",
    mode: "native-hls-auto",
  });
  assert.equal(subject.player.snapshot().qualityMode, "auto");
  assert.ok(subject.diagnosticEvents.some((entry) => entry.event === "player.quality"));
  const states = subject.diagnosticEvents
    .filter((entry) => entry.event === "player.state")
    .map((entry) => entry.details.state);
  assert.ok(states.includes("loading"));
  assert.ok(states.includes("playing"));
});

test("volume and mute commands are clamped and adapter failures remain typed", async () => {
  const subject = harness();
  await openPlaying(subject);
  assert.equal(subject.player.command({ type: "setVolume", volume: 3 }).ok, true);
  assert.equal(subject.media.state.volume, 1);
  assert.equal(subject.player.command({ type: "setMuted", muted: true }).ok, true);
  assert.equal(subject.media.state.muted, true);

  const failing = harness({ media: createFakeMediaAdapter({ setVolumeError: new Error("native volume failure") }) });
  await openPlaying(failing);
  const result = failing.player.command({ type: "setVolume", volume: 0.5 });
  assert.deepEqual(result.error, { code: "playback-failed", operation: "player-command" });
  assert.doesNotMatch(JSON.stringify(result), /native volume failure/);
});

test("a synchronous play failure is returned as a typed command result", async () => {
  let playCalls = 0;
  const media = createFakeMediaAdapter({
    playResult: () => {
      playCalls += 1;
      if (playCalls > 1) throw Object.assign(new Error("signed https://media.invalid/?token=secret"), { name: "InvalidStateError" });
      return Promise.resolve();
    },
  });
  const subject = harness({ media });
  await openPlaying(subject);
  const result = subject.player.command("play");
  assert.equal(result.ok, false);
  assert.deepEqual(result.error, {
    code: "playback-failed",
    operation: "player-command",
    nativeName: "InvalidStateError",
  });
  assert.doesNotMatch(JSON.stringify(result), /media\.invalid|secret/);
});

test("visibility pauses and resumes only playback that was active before suspension", async () => {
  const subject = harness();
  await openPlaying(subject);

  subject.visibility.setHidden(true);
  assert.equal(subject.media.calls.pause, 1);
  assert.equal(subject.player.snapshot().suspended, true);
  assert.equal(subject.player.snapshot().state, "paused");
  subject.visibility.setHidden(true);
  assert.equal(subject.media.calls.pause, 1);
  subject.visibility.setHidden(false);
  assert.equal(subject.media.calls.play, 2);
  subject.visibility.setHidden(false);
  assert.equal(subject.media.calls.play, 2);
  subject.media.emit("playing", { paused: false });
  assert.equal(subject.player.snapshot().suspended, false);

  subject.player.command("pause");
  subject.visibility.setHidden(true);
  subject.visibility.setHidden(false);
  assert.equal(subject.media.calls.play, 2);
});

test("opening while hidden defers autoplay and its bounded timeout until visibility returns", async () => {
  const visibility = createVisibilitySource();
  visibility.hidden = true;
  const subject = harness({ visibility, startTimeoutMs: 10 });
  const pending = subject.player.open(source());

  assert.equal(subject.media.calls.play, 0);
  assert.equal(subject.player.snapshot().suspended, true);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(subject.player.snapshot().state, "loading");

  visibility.setHidden(false);
  assert.equal(subject.media.calls.play, 1);
  subject.media.emit("playing", { paused: false, readyState: 4 });
  assert.equal((await pending).ok, true);
});

test("hiding during a pending play ignores its intentional AbortError and resumes", async () => {
  let rejectFirstPlay;
  let playCalls = 0;
  const media = createFakeMediaAdapter({
    playResult: () => {
      playCalls += 1;
      if (playCalls === 1) {
        return new Promise((_resolve, reject) => { rejectFirstPlay = reject; });
      }
      return Promise.resolve();
    },
  });
  const subject = harness({ media });
  const pending = subject.player.open(source());

  subject.visibility.setHidden(true);
  rejectFirstPlay(Object.assign(new Error("interrupted"), { name: "AbortError" }));
  await Promise.resolve();
  assert.equal(subject.player.snapshot().state, "loading");
  assert.equal(subject.player.snapshot().suspended, true);
  assert.equal(subject.media.calls.unload, 0);

  subject.visibility.setHidden(false);
  subject.media.emit("playing", { paused: false, readyState: 4 });
  assert.equal((await pending).ok, true);
});

test("Play followed by Pause ignores the superseded play promise rejection", async () => {
  let rejectSecondPlay;
  let playCalls = 0;
  const media = createFakeMediaAdapter({
    playResult: () => {
      playCalls += 1;
      if (playCalls === 2) {
        return new Promise((_resolve, reject) => { rejectSecondPlay = reject; });
      }
      return Promise.resolve();
    },
  });
  const subject = harness({ media });
  await openPlaying(subject);
  assert.equal(subject.player.command("play").ok, true);
  assert.equal(subject.player.command("pause").ok, true);
  rejectSecondPlay(Object.assign(new Error("interrupted"), { name: "AbortError" }));
  await Promise.resolve();

  assert.equal(subject.player.snapshot().state, "paused");
  assert.equal(subject.media.calls.unload, 0);
});

test("unsubscribe and terminal errors release listeners idempotently", async () => {
  const subject = harness();
  let calls = 0;
  const unsubscribe = subject.player.subscribe(() => { calls += 1; });
  unsubscribe();
  unsubscribe();
  const before = calls;
  const pending = subject.player.open(source());
  subject.media.emit("error", { nativeCode: 4 });
  await pending;
  assert.equal(calls, before);
  assert.equal(subject.media.listenerCount(), 0);
  assert.equal(subject.visibility.listenerCount(), 0);
  assert.equal(subject.media.calls.unload, 1);
});

test("native adapter contains DOM events and restores the media element presentation", async () => {
  const listeners = new Map();
  const classes = new Set();
  const attributes = new Set();
  const element = {
    currentTime: 12,
    duration: 30,
    volume: 0.8,
    muted: false,
    paused: false,
    ended: false,
    readyState: 4,
    error: null,
    seekable: { length: 1, start: () => 5, end: () => 30 },
    classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) },
    setAttribute: (name) => attributes.add(name),
    removeAttribute: (name) => { if (name === "src") element.src = ""; },
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name, listener) => { if (listeners.get(name) === listener) listeners.delete(name); },
    loadCalls: 0,
    pauseCalls: 0,
    load() { this.loadCalls += 1; },
    play() { return Promise.resolve(); },
    pause() { this.pauseCalls += 1; },
  };
  const adapter = createNativeMediaAdapter(element);
  let playingEvents = 0;
  const unsubscribe = adapter.subscribe("playing", () => { playingEvents += 1; });
  adapter.load("https://media.invalid/native.m3u8?token=secret");

  assert.equal(classes.has("player-media-active"), true);
  assert.equal(attributes.has("playsinline"), true);
  assert.deepEqual(adapter.read().seekableRanges, [[5, 30]]);
  listeners.get("playing")();
  assert.equal(playingEvents, 1);
  unsubscribe();
  assert.equal(listeners.has("playing"), false);

  adapter.unload();
  assert.equal(classes.has("player-media-active"), false);
  assert.equal(element.src, "");
  assert.equal(element.pauseCalls, 1);
  assert.equal(element.loadCalls, 2);
});
