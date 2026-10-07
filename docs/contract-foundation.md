# Contract foundation

**Implemented:** 2026-10-07

**Environment:** local Node.js fixture tests only

**LG C1 status:** pending

This layer isolates the undocumented RUTUBE response shapes selected in
[ADR 0001](adr/0001-packaged-custom-frontend.md). It is browser-compatible ES
module code intended for the webOS 6 Chromium 79 runtime. No live media URL,
cookie, account token, or response dump is stored in the repository.

## Public interfaces

- `createRutubeHttp(options)` returns `json(request)` and `text(request)`. It
  owns the timeout and composed cancellation signal and returns sanitized typed
  failures (`cancelled`, `offline`, `timeout`, `http`, `opaque-network`, or
  `malformed-response`). Fetch does not distinguish CORS from DNS/TLS failure,
  so it never falsely labels an opaque rejection as confirmed CORS. Failure
  values never include request URLs, response bodies, or native exception
  messages.
- `createCatalog({ http })` returns `home`, `search`, and `details`. Pages expose
  normalized numeric cursors instead of server continuation URLs. Videos expose
  only `videoId`, normalized presentation fields, and durations in
  milliseconds; raw API objects never escape.
- `createPlaybackSources({ http, clock })` returns `resolve`. Every call obtains
  fresh play options, selects VOD or live HLS, checks access/entitlement/DRM,
  derives expiry, and optionally inspects the master. The signed source URL is
  returned only as the in-memory capability required by the player.
- `inspectHlsManifest(text)` reads but never modifies the supplied manifest. It
  extracts deduplicated qualities, codecs, encryption, discontinuity, and
  alternate-audio metadata, recognized DATERANGE/CUE/SCTE markers, and unknown
  extension tags while preserving the original text.

Manifest inspection is advisory except when a successfully read manifest is
invalid, encrypted, or declares codecs outside the initial AVC/AAC boundary. If
a manifest fetch is explicitly classified as CORS-blocked, or Fetch reports an
opaque rejection that could be CORS, source resolution succeeds with an
`unknown` advertising classification and a typed warning because the native
media element may still be able to play the untouched URL. Cancellation,
timeout, confirmed offline, and HTTP failures remain typed failures and are
never degraded into warnings.

## Fixture policy

Fixtures live under `tests/fixtures/2026-10-07/`. JSON files retain observation
date, endpoint shape, public sample identifiers, booleans, and units. Media and
continuation locations use `.invalid` or explicit redaction markers. The HLS
fixtures are reduced synthetic representations of observed structures and do
not contain usable segment, signing, or key data.

Each JSON fixture identifies its basis. `sanitized-observation` means its shape
was captured in the dated research; `synthetic-contract-case` exercises a
documented but not locally observed boundary such as payment or active DRM. A
synthetic case is test coverage, not evidence that the response was observed.

Covered behaviors include flat and card-wrapped home records, mixed search,
details duration conversion, VOD/live source selection, DVR seekability,
unavailable and access-denied content, paid entitlement, DRM, missing/expired
sources, malformed payloads, duplicate HLS mirrors, advertising markers,
discontinuity, and encryption.

## Remaining integration assumptions

- Packaged-origin CORS for JSON, HLS masters, variants, and segments is unknown.
- Native HTML5 playback of the selected AVC/AAC sources is unverified on the
  target LG C1.
- Only an observed `expire` query value or explicit expiry field is understood;
  playback integration must resolve once more after an expiry-like start error.
- DRM, payment, authentication, manifest rewriting, and access bypass remain
  intentionally unsupported.
- Manifest marker classification is diagnostic. It never removes segments and
  does not claim all advertising is detected or absent.

## Local evidence

The dated result is recorded in
[`test-results/contract-foundation-local.md`](test-results/contract-foundation-local.md).
