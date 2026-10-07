import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { createCatalog } from "../src/js/catalog.js";
import { createFixtureHttp } from "./helpers/fixture-http.js";

const fixture = (name) => resolve("tests/fixtures/2026-10-07", name);

function catalogFor(routes) {
  return createCatalog({ http: createFixtureHttp(routes) });
}

test("home normalizes flat and card-wrapped videos without leaking continuations", async () => {
  const catalog = catalogFor({
    "/api/v2/video/recommendation/main?limit=20&page=1&show_hidden_videos=False&show_user_hidden_videos=False": fixture("catalog-home.json"),
  });

  const result = await catalog.home({});

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    items: [
      {
        videoId: "2458766add765d8048f731ee2eaaf926",
        title: "Public VOD fixture",
        durationMs: 342000,
        isLive: false,
        isOnAir: false,
        isAdult: false,
      },
      {
        videoId: "0ed0696149c131d3a7349372d730d4e6",
        title: "Public live fixture",
        durationMs: 0,
        isLive: true,
        isOnAir: true,
        isAdult: false,
      },
    ],
    page: 1,
    pageSize: 2,
    total: 2,
    nextCursor: "2",
    previousCursor: null,
  });
  assert.doesNotMatch(JSON.stringify(result), /redacted-continuation-url|https?:\/\//);
});

test("search filters non-video records and normalizes pagination", async () => {
  const catalog = catalogFor({
    "/api/search/combined/video_playlist?query=cat&limit=20&page=1": fixture("catalog-search.json"),
  });

  const result = await catalog.search({ query: " cat " });

  assert.equal(result.ok, true);
  assert.equal(result.value.items.length, 1);
  assert.equal(result.value.items[0].durationMs, 2659000);
  assert.equal(result.value.nextCursor, null);
});

test("details returns a stable model with explicit millisecond duration", async () => {
  const catalog = catalogFor({
    "/api/video/2458766add765d8048f731ee2eaaf926/": fixture("details-vod.json"),
  });

  const result = await catalog.details({ videoId: "2458766add765d8048f731ee2eaaf926" });

  assert.deepEqual(result, {
    ok: true,
    value: {
      videoId: "2458766add765d8048f731ee2eaaf926",
      title: "Public VOD fixture",
      description: "Sanitized description",
      authorName: "Fixture author",
      durationMs: 342000,
      isLive: false,
      isOnAir: false,
      isLicensed: false,
      isPaid: false,
    },
  });
});

test("catalog reports malformed required fields and cancellation as typed results", async () => {
  const malformed = createCatalog({
    http: { json: async () => ({ ok: true, value: { results: [{ title: "missing id" }] } }) },
  });
  const controller = new AbortController();
  controller.abort();
  const cancelled = catalogFor({});

  assert.equal((await malformed.home({})).error.code, "malformed-response");
  assert.equal((await cancelled.home({ signal: controller.signal })).error.code, "cancelled");
});
