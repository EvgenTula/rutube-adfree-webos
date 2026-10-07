import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { createAppFlow } from "../src/js/app-flow.js";
import { createCatalog } from "../src/js/catalog.js";
import { createPlayer } from "../src/js/player.js";
import { createPlaybackSources } from "../src/js/playback-sources.js";
import { createFakeMediaAdapter } from "./helpers/fake-media-adapter.js";
import { createFixtureHttp } from "./helpers/fixture-http.js";

const fixture = (name) => resolve("tests/fixtures/2026-10-07", name);
const videoId = "2458766add765d8048f731ee2eaaf926";
const sourceUrl = "https://media.invalid/vod/master.m3u8?expire=1893456000";
const optionsPath = `/api/play/options/${videoId}/?no_404=true&referer=https%3A%2F%2Frutube.ru%2Ftv-release%2Fwebos.server%2Fwebos%2F&pver=v2&ver=34.0.0&ac_client=linux_tv`;

function fakeNavigation() {
  let listener = null;
  return {
    mounts: [],
    disposed: 0,
    mount(model) { this.mounts.push(model); },
    subscribe(next) { listener = next; return () => { listener = null; }; },
    emit(effect) { if (listener) listener(effect); },
    dispose() { this.disposed += 1; },
  };
}

function memoryRenderer() {
  return {
    views: [],
    disposed: 0,
    render(view) {
      this.views.push(JSON.parse(JSON.stringify(view)));
      return { route: view.route, items: [], isRoot: view.route === "home" };
    },
    dispose() { this.disposed += 1; },
    latest() { return this.views[this.views.length - 1]; },
  };
}

async function waitFor(predicate, message = "condition") {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 0));
  }
  throw new Error(`Timed out waiting for ${message}`);
}

function fixtureHarness() {
  const routes = {
    "/api/v2/video/recommendation/main?limit=20&page=1&show_hidden_videos=False&show_user_hidden_videos=False": fixture("catalog-home.json"),
    "/api/search/combined/video_playlist?query=cat&limit=20&page=1": fixture("catalog-search.json"),
    [`/api/video/${videoId}/`]: fixture("details-vod.json"),
    "/api/video/4ceb9757e7eec396856b7c7b08b7565a/": fixture("details-vod.json"),
    [optionsPath]: fixture("play-options-vod.json"),
    [sourceUrl]: fixture("vod-master.m3u8"),
  };
  const http = createFixtureHttp(routes);
  const catalog = createCatalog({ http });
  const playbackSources = createPlaybackSources({ http, clock: () => new Date("2026-10-07T00:00:00Z") });
  const media = createFakeMediaAdapter();
  const player = createPlayer({ media, startTimeoutMs: 500 });
  const navigation = fakeNavigation();
  const renderer = memoryRenderer();
  const flow = createAppFlow({ catalog, playbackSources, player, navigation, renderer, delay: async () => {} });
  return { flow, media, player, navigation, renderer };
}

test("fixture-backed Home -> Details -> Player supports controls, Back, replay, and cleanup", async () => {
  const subject = fixtureHarness();
  subject.flow.start();
  await waitFor(() => subject.renderer.latest().home.status === "ready", "home catalog");
  assert.equal(subject.renderer.latest().home.items.length, 2);

  subject.flow.dispatch({ type: "OPEN_VIDEO", videoId });
  await waitFor(() => subject.renderer.latest().details.status === "ready", "video details");
  assert.equal(subject.renderer.latest().details.item.title, "Public VOD fixture");

  subject.flow.dispatch({ type: "PLAY", videoId, title: "Public VOD fixture" });
  await waitFor(() => subject.media.calls.load === 1, "media load");
  subject.media.emit("playing", { paused: false, readyState: 4, durationSeconds: 341.718 });
  await waitFor(() => subject.renderer.latest().playback.status === "playing", "playback start");
  assert.equal(subject.renderer.latest().playback.sourceSummary.manifest, "hls");
  assert.equal(subject.renderer.latest().playback.snapshot.qualityMode, "auto");

  subject.flow.dispatch({ type: "SEEK", offsetMs: 30000 });
  assert.equal(subject.media.calls.seek, 1);
  subject.flow.dispatch({ type: "TOGGLE_PLAY" });
  assert.equal(subject.player.snapshot().state, "paused");

  subject.media.emit("ended", { ended: true, currentTimeSeconds: 341.718 });
  await waitFor(() => subject.renderer.latest().playback.status === "ended", "ended screen");
  assert.equal(subject.player.snapshot().state, "closed");
  assert.equal(subject.media.listenerCount(), 0);
  subject.flow.dispatch({ type: "REPLAY" });
  await waitFor(() => subject.media.calls.load === 2, "replay load");
  subject.media.emit("playing", { paused: false, readyState: 4 });
  await waitFor(() => subject.renderer.latest().playback.status === "playing", "replay start");

  subject.flow.dispatch({ type: "BACK" });
  assert.equal(subject.renderer.latest().playback.controlsVisible, false);
  subject.navigation.emit({ type: "direction", direction: "left", moved: false });
  assert.equal(subject.renderer.latest().playback.controlsVisible, true);
  subject.flow.dispatch({ type: "BACK" });
  assert.equal(subject.renderer.latest().playback.controlsVisible, false);
  subject.flow.dispatch({ type: "BACK" });
  assert.equal(subject.renderer.latest().route, "details");
  assert.equal(subject.player.snapshot().state, "closed");
  subject.flow.stop();
  assert.equal(subject.media.listenerCount(), 0);
  assert.equal(subject.navigation.disposed, 1);
  assert.equal(subject.renderer.disposed, 1);
});

test("fixture-backed Search -> Details -> Player closes playback when Search is opened", async () => {
  const subject = fixtureHarness();
  subject.flow.start();
  await waitFor(() => subject.renderer.latest().home.status === "ready", "home catalog");
  subject.flow.dispatch({ type: "OPEN_SEARCH" });
  subject.flow.dispatch({ type: "SEARCH", query: "cat" });
  await waitFor(() => subject.renderer.latest().search.status === "ready", "search results");
  const result = subject.renderer.latest().search.items[0];
  subject.flow.dispatch({ type: "OPEN_VIDEO", videoId: result.videoId });
  await waitFor(() => subject.renderer.latest().details.status === "ready", "search details");
  subject.flow.dispatch({ type: "PLAY", videoId, title: "Search playback" });
  await waitFor(() => subject.media.calls.load === 1, "search media load");
  subject.media.emit("playing", { paused: false, readyState: 4 });
  await waitFor(() => subject.renderer.latest().playback.status === "playing", "search playback");

  subject.flow.dispatch({ type: "OPEN_SEARCH" });
  assert.equal(subject.renderer.latest().route, "search");
  assert.equal(subject.player.snapshot().state, "closed");
  assert.equal(subject.media.listenerCount(), 0);
  subject.flow.stop();
});

test("Back cancels a details request that is still loading", async () => {
  let detailsAborted = false;
  const catalog = {
    home: async () => ({ ok: true, value: { items: [{ videoId: "v", title: "Video" }], nextCursor: null, total: 1 } }),
    search: async () => ({ ok: true, value: { items: [], nextCursor: null, total: 0 } }),
    details: ({ signal }) => new Promise((resolveDetails) => {
      signal.addEventListener("abort", () => {
        detailsAborted = true;
        resolveDetails({ ok: false, error: { code: "cancelled", operation: "details" } });
      });
    }),
  };
  const player = {
    snapshot: () => ({ state: "closed" }),
    subscribe(listener) { listener(this.snapshot()); return () => {}; },
    close() { return this.snapshot(); },
    command() { return { ok: false, error: { code: "invalid-state" } }; },
  };
  const renderer = memoryRenderer();
  const flow = createAppFlow({ catalog, playbackSources: {}, player, navigation: fakeNavigation(), renderer });
  flow.start();
  await waitFor(() => renderer.latest().home.status === "ready", "home ready");
  flow.dispatch({ type: "OPEN_VIDEO", videoId: "v" });
  await waitFor(() => renderer.latest().details.status === "loading", "details loading");
  flow.dispatch({ type: "BACK" });
  assert.equal(detailsAborted, true);
  assert.equal(renderer.latest().route, "home");
  flow.stop();
});

test("terminal source errors have no retry action while transient errors recover manually", async () => {
  let homeCalls = 0;
  let recovered = false;
  const catalog = {
    async home() {
      homeCalls += 1;
      if (!recovered) return { ok: false, error: { code: "offline", operation: "home" } };
      return { ok: true, value: { items: [], nextCursor: null, total: 0 } };
    },
    search: async () => ({ ok: true, value: { items: [], nextCursor: null, total: 0 } }),
    details: async () => ({ ok: true, value: { videoId: "v", title: "Video" } }),
  };
  const player = {
    snapshot: () => ({ state: "closed" }),
    subscribe(listener) { listener(this.snapshot()); return () => {}; },
    close() { return this.snapshot(); },
    command() { return { ok: false, error: { code: "invalid-state" } }; },
  };
  const renderer = memoryRenderer();
  const flow = createAppFlow({
    catalog,
    playbackSources: { resolve: async () => ({ ok: false, error: { code: "unavailable", reason: "geo" } }) },
    player,
    navigation: fakeNavigation(),
    renderer,
    delay: async () => {},
  });
  flow.start();
  await waitFor(() => renderer.latest().home.status === "error", "offline error");
  assert.equal(homeCalls, 2);
  assert.equal(renderer.latest().home.canRetry, true);
  recovered = true;
  flow.dispatch({ type: "RETRY" });
  await waitFor(() => renderer.latest().home.status === "empty", "manual recovery");

  flow.dispatch({ type: "PLAY", videoId: "v", title: "Unavailable" });
  await waitFor(() => renderer.latest().playback.status === "error", "terminal source error");
  assert.equal(renderer.latest().playback.error.code, "unavailable");
  assert.equal(renderer.latest().playback.canRetry, false);
  flow.stop();
});

test("native playback failure closes the Player and releases its listeners", async () => {
  const subject = fixtureHarness();
  subject.flow.start();
  await waitFor(() => subject.renderer.latest().home.status === "ready", "home catalog");
  subject.flow.dispatch({ type: "OPEN_VIDEO", videoId });
  await waitFor(() => subject.renderer.latest().details.status === "ready", "details");
  subject.flow.dispatch({ type: "PLAY", videoId, title: "Failure" });
  await waitFor(() => subject.media.calls.load === 1, "media load");
  subject.media.emit("error", { nativeCode: 3 });
  await waitFor(() => subject.renderer.latest().playback.status === "error", "playback error");
  assert.equal(subject.player.snapshot().state, "closed");
  assert.equal(subject.media.listenerCount(), 0);
  assert.equal(subject.renderer.latest().playback.canRetry, true);
  subject.flow.stop();
});

test("a real Player source-expired error settles before AppFlow refreshes it once", async () => {
  let now = new Date("2029-12-31T23:59:59Z").getTime();
  let sourceCalls = 0;
  const media = createFakeMediaAdapter();
  const player = createPlayer({ media, clock: () => now, startTimeoutMs: 500 });
  const playbackSources = {
    async resolve() {
      sourceCalls += 1;
      return {
        ok: true,
        value: {
          kind: "vod",
          manifest: "hls",
          url: `https://media.invalid/session-${sourceCalls}.m3u8`,
          seekable: true,
          qualities: [],
          codecs: [],
          advertising: "none-observed",
          warnings: [],
          expiresAt: sourceCalls === 1 ? "2030-01-01T00:00:00Z" : "2040-01-01T00:00:00Z",
        },
      };
    },
  };
  const catalog = {
    home: async () => ({ ok: true, value: { items: [], nextCursor: null, total: 0 } }),
    search: async () => ({ ok: true, value: { items: [], nextCursor: null, total: 0 } }),
    details: async () => ({ ok: true, value: { videoId: "v", title: "Video" } }),
  };
  const renderer = memoryRenderer();
  const flow = createAppFlow({ catalog, playbackSources, player, navigation: fakeNavigation(), renderer, delay: async () => {} });
  flow.start();
  await waitFor(() => renderer.latest().home.status === "empty", "home empty");
  flow.dispatch({ type: "PLAY", videoId: "v", title: "Expiring" });
  await waitFor(() => media.calls.load === 1, "first source load");
  now = new Date("2030-01-01T00:00:01Z").getTime();
  media.emit("error", { nativeCode: 2 });
  await waitFor(() => sourceCalls === 2 && media.calls.load === 2, "one source refresh");
  media.emit("playing", { paused: false, readyState: 4 });
  await waitFor(() => renderer.latest().playback.status === "playing", "refreshed playback");
  assert.equal(sourceCalls, 2);
  assert.equal(player.snapshot().state, "playing");
  flow.stop();
});

test("ten consecutive fixture-backed sessions release media listeners between videos", async () => {
  const subject = fixtureHarness();
  subject.flow.start();
  await waitFor(() => subject.renderer.latest().home.status === "ready", "home catalog");
  subject.flow.dispatch({ type: "OPEN_VIDEO", videoId });
  await waitFor(() => subject.renderer.latest().details.status === "ready", "video details");

  for (let session = 1; session <= 10; session += 1) {
    subject.flow.dispatch({ type: "PLAY", videoId, title: `Session ${session}` });
    await waitFor(() => subject.media.calls.load === session, `session ${session} load`);
    subject.media.emit("playing", { paused: false, readyState: 4, durationSeconds: 341.718 });
    await waitFor(() => subject.renderer.latest().playback.status === "playing", `session ${session} start`);
    subject.flow.dispatch({ type: "BACK" });
    subject.flow.dispatch({ type: "BACK" });
    assert.equal(subject.renderer.latest().route, "details");
    assert.equal(subject.media.listenerCount(), 0);
  }

  assert.equal(subject.media.calls.unload, 10);
  subject.flow.stop();
});

test("search exposes loading, results, empty query, and stale request cancellation", async () => {
  let homeAborted = false;
  let homeCalls = 0;
  const catalog = {
    home: ({ signal }) => {
      homeCalls += 1;
      if (homeCalls > 1) return Promise.resolve({ ok: true, value: { items: [], nextCursor: null, total: 0 } });
      return new Promise((resolveHome) => {
        signal.addEventListener("abort", () => {
          homeAborted = true;
          resolveHome({ ok: false, error: { code: "cancelled", operation: "home" } });
        });
      });
    },
    search: async ({ query }) => ({
      ok: true,
      value: { items: [{ videoId: "search", title: query, durationMs: 1000 }], nextCursor: null, total: 1 },
    }),
    details: async () => ({ ok: false, error: { code: "unexpected" } }),
  };
  const player = {
    snapshot: () => ({ state: "closed" }),
    subscribe(listener) { listener(this.snapshot()); return () => {}; },
    close() { return this.snapshot(); },
    command() { return { ok: false, error: { code: "invalid-state" } }; },
  };
  const renderer = memoryRenderer();
  const flow = createAppFlow({
    catalog,
    playbackSources: { resolve: async () => ({ ok: false, error: { code: "unexpected" } }) },
    player,
    navigation: fakeNavigation(),
    renderer,
    delay: async () => {},
  });
  flow.start();
  flow.dispatch({ type: "OPEN_SEARCH" });
  flow.dispatch({ type: "SEARCH", query: " коты " });
  await waitFor(() => renderer.latest().search.status === "ready", "search results");
  assert.equal(homeAborted, true);
  assert.equal(renderer.latest().search.items[0].title, "коты");
  flow.dispatch({ type: "SEARCH", query: "  " });
  assert.equal(renderer.latest().search.status, "idle");
  flow.dispatch({ type: "BACK" });
  await waitFor(() => renderer.latest().route === "home" && renderer.latest().home.status === "empty", "reloaded home");
  assert.equal(homeCalls, 2);
  flow.stop();
});

test("bounded retry succeeds once and source expiry refresh happens at most once", async () => {
  let homeCalls = 0;
  let sourceCalls = 0;
  let openCalls = 0;
  let playerListener = null;
  const player = {
    model: { state: "closed" },
    snapshot() { return this.model; },
    subscribe(listener) { playerListener = listener; listener(this.model); return () => { playerListener = null; }; },
    close() { this.model = { state: "closed" }; return this.model; },
    command() { return { ok: true, value: this.model }; },
    async open() {
      openCalls += 1;
      if (openCalls === 1) return { ok: false, error: { code: "source-expired", operation: "player-open" } };
      this.model = { state: "playing", qualityMode: "auto" };
      if (playerListener) playerListener(this.model);
      return { ok: true, value: this.model };
    },
  };
  const catalog = {
    async home() {
      homeCalls += 1;
      if (homeCalls === 1) return { ok: false, error: { code: "timeout", operation: "home" } };
      return { ok: true, value: { items: [], nextCursor: null, total: 0 } };
    },
    details: async () => ({ ok: true, value: { videoId: "v", title: "Video" } }),
    search: async () => ({ ok: true, value: { items: [], nextCursor: null, total: 0 } }),
  };
  const playbackSources = {
    async resolve() {
      sourceCalls += 1;
      return { ok: true, value: { kind: "vod", manifest: "hls", url: "https://media.invalid/v.m3u8", seekable: true, qualities: [], codecs: [], advertising: "none-observed", warnings: [] } };
    },
  };
  const renderer = memoryRenderer();
  const flow = createAppFlow({ catalog, playbackSources, player, navigation: fakeNavigation(), renderer, delay: async () => {} });
  flow.start();
  await waitFor(() => renderer.latest().home.status === "empty", "retried home");
  assert.equal(homeCalls, 2);
  flow.dispatch({ type: "PLAY", videoId: "v", title: "Video" });
  await waitFor(() => renderer.latest().playback.status === "playing", "refreshed playback");
  assert.equal(sourceCalls, 2);
  assert.equal(openCalls, 2);
  flow.stop();
});

test("Home load-more appends the normalized next page", async () => {
  const seenCursors = [];
  const catalog = {
    async home({ cursor }) {
      seenCursors.push(cursor || null);
      return cursor
        ? { ok: true, value: { items: [{ videoId: "b", title: "Second" }], nextCursor: null, total: 2 } }
        : { ok: true, value: { items: [{ videoId: "a", title: "First" }], nextCursor: "2", total: 2 } };
    },
    search: async () => ({ ok: true, value: { items: [], nextCursor: null, total: 0 } }),
    details: async () => ({ ok: false, error: { code: "unused" } }),
  };
  const player = {
    snapshot: () => ({ state: "closed" }),
    subscribe(listener) { listener(this.snapshot()); return () => {}; },
    close() { return this.snapshot(); },
    command() { return { ok: false, error: { code: "invalid-state" } }; },
  };
  const renderer = memoryRenderer();
  const flow = createAppFlow({ catalog, playbackSources: {}, player, navigation: fakeNavigation(), renderer });
  flow.start();
  await waitFor(() => renderer.latest().home.status === "ready", "first home page");
  flow.dispatch({ type: "LOAD_MORE" });
  await waitFor(() => renderer.latest().home.items.length === 2, "second home page");
  assert.deepEqual(seenCursors, [null, "2"]);
  assert.deepEqual(renderer.latest().home.items.map((item) => item.title), ["First", "Second"]);
  flow.stop();
});
