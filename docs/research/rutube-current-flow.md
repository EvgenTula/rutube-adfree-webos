# Current first-party RUTUBE web/TV flow

**Observed:** 2026-10-07
**Scope:** unauthenticated public pages, first-party API responses, the official
webOS package, first-party JavaScript assets, and signed manifests returned for
public videos. No credentials, cookies, device codes, or access-control bypasses
were used. Signed URL values were inspected in memory and were not persisted.

## Executive result

The current official webOS application is a small web bootstrap, not a
self-contained native client. RUTUBE publishes a 13,528-byte
[`ru.rutube.webos.ipk`](https://promo.rutubelist.ru/distr/ru.rutube.webos.ipk);
its package metadata identifies a web app (`ru.rutube.webos`, version `34.0.0`)
whose 281-byte `index.html` loads the hosted application at
[`/tv-release/webos.server/webos/`](https://rutube.ru/tv-release/webos.server/webos/).
The hosted page currently loads one approximately 2.39 MB first-party bundle,
[`main.00f679e3.js`](https://rutube.ru/tv-release/webos.server/webos/main.00f679e3.js).
No application source from the package or bundle was copied into this project.

The hosted TV client uses public JSON catalog/search/details endpoints, then a
`play/options` request to obtain short-lived playback locations. VOD samples
returned HLS and, for the TV-style request, direct MP4 mirror locations. Live
samples returned HLS through `live_streams.hls`. The observed media was AVC
(`avc1`) plus AAC-LC (`mp4a.40.2`); HEVC, VP9, DASH, and active DRM were **not**
observed in the sample set.

The strongest current evidence classifies RUTUBE advertising as a separate
client/player-controlled ad path rather than stitched segments in the sampled
content manifests:

- RUTUBE's official terms describe an independent advertising container and a
  "pause" method that starts a separate advertising file while content is
  paused/interrupted ([official embed advertising terms](https://rutube.ru/info/erid_embed_ugc/)).
- The official TV bundle contains VAST parsing/tracking, pre-roll, mid-roll,
  post-roll, and an `advert-disable` feature request; playback metadata exposes
  `advert`, `yast`, `yast_live_online`, `cuepoints`, and `drm_token`
  ([official TV bundle](https://rutube.ru/tv-release/webos.server/webos/main.00f679e3.js)).
- In all public videos sampled from this network, `advert` was empty and the
  ad-related fields were null. The inspected VOD and live media playlists had no
  `DATERANGE`, `CUE`, `SCTE`, or `DISCONTINUITY` tags and no extra duration that
  could be identified as an inserted ad.

That is enough to build a content playback spike without manifest rewriting.
It is **not** evidence that every region, account, content class, or live stream
is free of server-side insertion. The player should preserve playback and log an
unknown classification if future manifests contain unrecognized markers.

## Official TV application architecture

The official [Smart TV product page](https://rutube.ru/info/smarttv/) links both
the webOS `.ipk` and a current product manual. The
[current Smart TV manual](https://promo.rutubelist.ru/distr/%D0%9E%D0%BF%D0%B8%D1%81%D0%B0%D0%BD%D0%B8%D0%B5_%D1%82%D0%B2-%D0%BF%D1%80%D0%B8%D0%BB%D0%BE%D0%B6%D0%B5%D0%BD%D0%B8%D1%8F.pdf)
documents Search, Home, subscriptions, categories, Kids, Sport, TV channels,
personal sections, QR/web authorization, quality selection, subtitles, seeking,
and recommendations. It claims webOS 1.0+ support; this statement does not
replace testing on the target LG C1.

Observed package facts:

| Fact | Observation |
| --- | --- |
| HTTP metadata | `200`, `application/octet-stream`, 13,528 bytes, last modified 2026-03-23 |
| Package | `ru.rutube.webos`, version `34.0.0`, vendor `Rutube`, type `web` |
| Local payload | `appinfo.json`, `index.html`, icons, splash image only |
| Bootstrap target | `https://rutube.ru/tv-release/webos.server/webos/` |
| Hosted asset | `main.00f679e3.js`, observed size 2,386,608 bytes |

The package evidence makes a thin wrapper technically plausible. It also makes
that option dependent on RUTUBE's remotely updated code, DOM, APIs, advertising
behavior, and legacy browser compatibility. A custom frontend can reuse the
same public content/playback flow behind adapters while avoiding DOM patching.

The TV navigation response is public at
[`/pangolin/api/tv/navigation/Linux/`](https://rutube.ru/pangolin/api/tv/navigation/Linux/).
Despite running on webOS, the current bundle requests the `Linux` navigation
profile and sends `ac_client=linux_tv` for playback. The observed main menu was
Search, Home, Categories, Movies and series, Kids, Sport, and TV channels; the
"My" group contained subscriptions, Watch later, playlists, history, and liked
videos. These server-driven labels/routes can change independently of the
package.

## Content API flow

The following routes were found in current first-party HTML/bundles and then
requested directly without authentication.

| Purpose | Endpoint | Observed response |
| --- | --- | --- |
| Home/recommendations | [`GET /api/v2/video/recommendation/main`](https://rutube.ru/api/v2/video/recommendation/main?limit=3&show_hidden_videos=False&show_user_hidden_videos=False) | Paginated flat video records: `has_next`, `next`, `previous`, `page`, `per_page`, `results` |
| Curated home shelves | e.g. [`GET /api/feeds/cardgroup/1182`](https://rutube.ru/api/feeds/cardgroup/1182?limit=3&noTitle=True&show_hidden_videos=False) | Paginated card wrappers with `content_type`, `object_id`, `object` |
| TV category/feed | [`GET /pangolin/api/tv/feeds/{slug}/`](https://rutube.ru/pangolin/api/tv/feeds/kids/?version=34.0.0&platform=linux_tv) | Feed metadata with tabs and presentation data; observed slugs include `kids`, `sport`, `smart_category`, `live_smarttv`, `movies-serials` |
| TV search: videos/playlists | [`GET /api/search/combined/video_playlist`](https://rutube.ru/api/search/combined/video_playlist?query=%D0%BA%D0%BE%D1%82) | `count`, pagination, and mixed `results` with `content_type` |
| TV search: cards/channels | [`GET /api/search/combined/cards/list`](https://rutube.ru/api/search/combined/cards/list?query=%D0%BA%D0%BE%D1%82) | Paginated channel/project cards |
| TV autocomplete | [`GET /api/search/autocomplete/video/`](https://rutube.ru/api/search/autocomplete/video/?query=%D0%BA%D0%BE%D1%82) | `results[{value,weight}]` plus pagination fields |
| Legacy/simple video search | [`GET /api/search/video/`](https://rutube.ru/api/search/video/?query=%D0%BA%D0%BE%D1%82&limit=2) | Paginated video records; still live, but the TV bundle uses the combined routes above |
| Video details | [`GET /api/video/{id}/`](https://rutube.ru/api/video/2458766add765d8048f731ee2eaaf926/) | One video object with title, author, duration, flags, metadata, and public URLs |
| TV details wrapper | [`GET /pangolin/api/tv/video/{id}`](https://rutube.ru/pangolin/api/tv/video/2458766add765d8048f731ee2eaaf926) | `result.video` plus optional `metainfoVideo`, `metainfoTVShow`, and `metainfoTVShowVideo` |

The official desktop home HTML also contained calls to tag feeds, promo/card
groups, and `v2/video/recommendation/main`, so a single "home endpoint" should
not be assumed. Home is assembled from server-selected sources. Keep a narrow
home adapter that can accept either flat video results or card groups.

### Safe response examples

These examples preserve the observed shape but omit analytics, user, image,
tracking, and continuation URL values. They are suitable as the starting point
for fixtures; fixture provenance should retain the observation date and source
endpoint.

```json
{
  "count": 88,
  "has_next": true,
  "next": "<redacted-continuation-url>",
  "previous": null,
  "current_page": 1,
  "results": [
    {
      "id": "4ceb9757e7eec396856b7c7b08b7565a",
      "title": "Котенок Котэ Сборник - ЗАБАВНЫЕ ЖИВОТНЫЕ - Мультики для детей малышей",
      "duration": 2659,
      "video_url": "https://rutube.ru/video/4ceb9757e7eec396856b7c7b08b7565a/",
      "is_adult": false,
      "is_livestream": false,
      "is_on_air": false,
      "content_type": "video"
    }
  ]
}
```

```json
{
  "id": "2458766add765d8048f731ee2eaaf926",
  "title": "Как искать видео, каналы и авторов на Rutube",
  "duration": 342,
  "is_livestream": false,
  "is_on_air": false,
  "is_licensed": false,
  "is_paid": false,
  "origin_type": "rtb",
  "stream_type": null
}
```

Important normalization detail: `/api/video/{id}/` and the TV details wrapper
reported duration in whole **seconds** (`342` for the sample), while
`/api/play/options/{id}` reported **milliseconds** (`341718`). The adapter must
name/convert the units rather than exposing a generic `duration` number.

## Playback source retrieval

RUTUBE officially documents the public
[`/api/play/options/{id}`](https://rutube.ru/info/embed/) endpoint as the complete
attribute source used by the embed player. A plain command-line request from the
research environment was rejected, while a request with a normal browser user
agent and public video-page `Referer` returned JSON without authentication. The
application should send only documented/observed client context and must never
persist response URLs in fixtures or logs.

The current TV bundle builds a request equivalent to:

```text
GET /api/play/options/{videoId}/
    ?no_404=true
    &referer=<public TV app URL>
    &pver=v2
    &ver=34.0.0
    &ac_client=linux_tv
    &...
```

The additional bundle-controlled values include an advertising configuration
version and media-query capability data. They are not required for the basic
public sample, should not be copied as undocumented constants, and should be
added only when an observed playback case requires them.

### VOD response

For public VOD `2458766add765d8048f731ee2eaaf926`, the browser-style response
contained `video_balancer.default` and `video_balancer.m3u8`; the TV-style
response also contained `video_balancer.json`. All were signed, expiring URLs.

- `m3u8`: `https://bl.rutube.ru/route/{videoId}.m3u8` plus signed query fields
  `guids`, `sign`, `expire`, `guarantee`, and `scheme`.
- `json`: `https://bl.rutube.ru/route/{videoId}.json` plus a signed query. Its
  `results` was an array of two signed CDN mirror URLs to the same `.mp4` object.
- The response also exposed `advert`, `cuepoints`, `drm_token`, `captions`,
  `audiotracks`, `live_streams`, viewer/analytics fields, and descriptive data.

Safe shape:

```json
{
  "video_id": "2458766add765d8048f731ee2eaaf926",
  "duration": 341718,
  "has_video": true,
  "is_licensed": false,
  "video_balancer": {
    "default": "<signed-hls-url>",
    "m3u8": "<signed-hls-url>",
    "json": "<signed-balancer-json-url>"
  },
  "advert": [],
  "cuepoints": [],
  "drm_token": null,
  "live_streams": {}
}
```

Do not assert that `json` always exists: it was absent in the simpler browser
request and appeared in the TV-style request. Treat each balancer field as an
optional capability.

### Live response

For public live broadcast `0ed0696149c131d3a7349372d730d4e6`,
[`/api/video/{id}/`](https://rutube.ru/api/video/0ed0696149c131d3a7349372d730d4e6/)
reported `is_livestream=true`, `is_on_air=true`, and
`stream_type="broadcast"`. Its play options had an empty `video_balancer` and a
`live_streams.hls` array. The first entry exposed:

```json
{
  "GeoIP_TZ": "<omitted>",
  "is_audio": true,
  "is_video": true,
  "is_dvr": false,
  "url": "<signed-live-hls-url>"
}
```

The source resolver therefore needs two explicit paths:

1. VOD: prefer `video_balancer.m3u8`, with controlled fallback to other
   supported balancer fields.
2. Live: select a compatible entry from `live_streams.hls` and honor `is_dvr`
   before enabling seek.

An official embed example ID (`7716bd3e665725c3c008ae7ab4ff02e2`) returned a
`blocking_rule` response from this network saying the video was unavailable by
rights-holder decision or because of VPN use, while the public samples above
played. Source retrieval must model blocked/unavailable content as a typed error;
the spike must not rely on a single hard-coded video.

## Manifest and codec observations

### VOD HLS

The VOD master playlist for `2458766add765d8048f731ee2eaaf926`
contained six rendition levels, each duplicated across two CDN hosts:

| Resolution | Declared bandwidth | Frame rate | Codecs |
| --- | ---: | ---: | --- |
| 256x144 | 123,000 | 24 | `avc1.42c01f`, `mp4a.40.2` |
| 432x232 | 184,000 | 24 | `avc1.42c01f`, `mp4a.40.2` |
| 640x360 | 289,000 | 24 | `avc1.42c01f`, `mp4a.40.2` |
| 856x480 | 441,000 | 24 | `avc1.4d401f`, `mp4a.40.2` |
| 1280x720 | 740,000 | 24 | `avc1.640029`, `mp4a.40.2` |
| 1920x1080 | 1,159,000 | 24 | `avc1.640029`, `mp4a.40.2` |

The inspected 1080p media playlist was VOD, consisted of 87 MPEG-TS segments,
and summed to 341.708 seconds. It used `EXTINF`, `MEDIA-SEQUENCE`,
`TARGETDURATION`, `PLAYLIST-TYPE`, `INDEPENDENT-SEGMENTS`, and `ENDLIST`. It had
no encryption key, initialization map, discontinuity, date range, cue, or SCTE
tag.

### Live HLS

The live sample master contained mirrored 640x360 at 1 Mbps and 1280x720 at
4 Mbps variants, both declaring `avc1.64001f,mp4a.40.2`. The inspected 720p
media playlist exposed a 48-second sliding window with 12 segments and only the
normal live tags (`EXTINF`, `MEDIA-SEQUENCE`, `TARGETDURATION`, `VERSION`). It
had no ad/discontinuity/encryption marker in the observed window.

### DRM boundary

The current official TV bundle contains Widevine EME/license-handling code, and
the play-options schema contains `drm_token`. RUTUBE's official player terms
also describe possible AES-128 HLS encryption and DRM integration
([player technology terms](https://rutube.ru/info/adv_player/)). However,
`drm_token` was null and no `EXT-X-KEY` appeared for every inspected sample.
Therefore:

- active DRM is not required for the initial public playback fixture set;
- DRM/encryption must still be detected and rejected with an actionable typed
  error until a legitimate supported flow is observed and implemented;
- do not infer that an empty token on one video means RUTUBE is DRM-free.

## Advertising classification

### First-party evidence

1. The official RUTUBE embed advertising terms define a separate advertising
   container and describe advertising as a separate file started while content
   is paused or interrupted
   ([source](https://rutube.ru/info/erid_embed_ugc/)).
2. The official TV bundle has a VAST client, VAST tracking/error handling,
   pre-roll/mid-roll/post-roll state, ad sequencing, and a request to
   `/pangolin/api/tv/features/advert-disable`
   ([source](https://rutube.ru/tv-release/webos.server/webos/main.00f679e3.js)).
3. The current `play/options` responses expose an explicit `advert` collection
   and related ad metadata separately from `video_balancer`/`live_streams`.
4. The sampled content manifests did not contain recognized ad markers or
   stitched discontinuities.
5. RUTUBE's partner rules explicitly say not to disable or cover ads in its
   embedded player ([official platform rules](https://rutube.ru/info/platforma/)),
   while RUTUBE also offers an official paid no-ad service whose terms describe
   skipping variable ad activity in the player
   ([official no-ad terms](https://rutube.ru/info/agreement_no_adv/)).

### Classification and uncertainty

**Observed classification:** player-side/client-side ad decision and playback,
using separate VAST-driven ad media, for the official player architecture.

**Not observed:** manifest-inserted markers or identifiable server-side stitched
ad segments in the selected VOD/live samples.

**Still uncertain:** the ad server returned no ad inventory for the research
network, so an actual pre-roll/mid-roll media request was not captured. Behavior
can vary by region, account/subscription, rights, content, time, and targeting.
No conclusion should be generalized to all RUTUBE content until a targeted
Russian-network device run captures a real ad break with sanitized logs.

**Implementation implication:** the playback spike should play only the content
source selected from `video_balancer` or `live_streams`; it does not need to
rewrite the observed manifests. Do not embed or patch the official RUTUBE player
and claim supported ad suppression: RUTUBE's published partner terms prohibit
that behavior. Before public distribution, obtain a legal/product decision on
whether a custom client that omits the official ad container is acceptable.

## Reproduction procedure

The commands below intentionally print responses containing short-lived source
URLs. Run them locally, inspect in memory, and do not redirect raw output into
the repository. Never add cookies or authorization headers to fixtures.

```powershell
$videoId = '2458766add765d8048f731ee2eaaf926'
$referer = "https://rutube.ru/video/$videoId/"

curl.exe -sS `
  -A 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36' `
  -e $referer `
  "https://rutube.ru/api/play/options/$videoId"
```

For the official TV request shape:

```powershell
$videoId = '2458766add765d8048f731ee2eaaf926'
$referer = 'https://rutube.ru/tv-release/webos.server/webos/'
$encodedReferer = [uri]::EscapeDataString($referer)

curl.exe -sS `
  -A 'Mozilla/5.0 (Web0S; Linux/SmartTV)' `
  -e $referer `
  "https://rutube.ru/api/play/options/$videoId/?no_404=true&referer=$encodedReferer&pver=v2&ver=34.0.0&ac_client=linux_tv"
```

When converting an observed response to a fixture:

- replace every `video_balancer`, `live_streams.*.url`, `stat*`, tracking,
  viewer, token, UUID, and continuation URL value with a deterministic marker;
- retain public content ID, booleans, duration with explicit unit, source field
  names, rendition metadata, and the observation date;
- reduce images/descriptions to representative placeholders;
- never retain response cookies or signed query values.

## Recommended implementation seams

1. `RutubeCatalogAdapter`
   - home via `v2/video/recommendation/main` plus optional server-driven groups;
   - TV categories via `/pangolin/api/tv/feeds/{slug}`;
   - mixed search via the three combined/autocomplete endpoints.
2. `RutubeVideoDetailsAdapter`
   - `/api/video/{id}/` as the stable minimal details shape;
   - normalize duration seconds and visibility/paid/live flags.
3. `RutubeSourceResolver`
   - request fresh `play/options` per playback;
   - VOD and live branches as described above;
   - never cache or log signed source URLs;
   - typed unavailable, geo/rights-blocked, paid, DRM, malformed, and expired
     source errors.
4. `HlsCapabilityProbe`
   - initially accept AVC/AAC HLS;
   - derive qualities from `EXT-X-STREAM-INF`, deduplicating mirror entries;
   - expose `is_dvr` before enabling live seek;
   - detect encryption and unknown ad markers without transforming them.
5. `AdvertisingClassifier`
   - treat explicit `advert`/VAST metadata as player-side advertising;
   - treat recognized HLS markers separately;
   - return `unknown` and preserve playback when evidence is insufficient.

## Gate assessment and remaining work

This research is sufficient to implement an unauthenticated single-video
desktop playback spike and fixture-based adapters. It does **not** close Phase 1
or the real-device gate because the following remain:

- capture one actual ad response/break on a Russian-network LG C1 and sanitize
  its control-plane fields;
- verify HLS and direct MP4 behavior in the LG C1 media stack;
- identify any content that currently serves HEVC, VP9, DASH, subtitles,
  alternate audio, encryption, or active DRM;
- verify source expiry/refresh behavior and CORS from the packaged app origin;
- record exact target TV model suffix, firmware, webOS version, and region;
- complete the separate existing-client/Rupoop/license research reports and the
  architecture ADR.
