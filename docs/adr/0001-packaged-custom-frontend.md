# ADR 0001: Packaged custom frontend with native HLS playback

- **Status:** Accepted for the playback spike; production use remains conditional
  on the Phase 2 real-device gate
- **Date:** 2026-10-07
- **Decision owners:** project maintainers
- **Evidence:**
  [`rutube-current-flow.md`](../research/rutube-current-flow.md),
  [`webos-existing-and-platform.md`](../research/webos-existing-and-platform.md),
  and [`rupoop-protocol-reference.md`](../research/rupoop-protocol-reference.md)

## Context

The product needs reliable public RUTUBE playback, deterministic Magic Remote
navigation, actionable diagnostics, and fewer unnecessary advertising
interruptions on an LG C1 running webOS 6. The implementation must remain
small enough to maintain when undocumented RUTUBE response shapes change.

Research established the following:

- RUTUBE's official webOS package is a hosted web app whose local package only
  redirects to a remotely updated TV frontend. A redirect-only wrapper is
  therefore proven to launch, but adds no control or observability.
- No maintained open-source RUTUBE webOS client or advertising modification was
  found in the official Homebrew catalog. The discovered third-party package is
  an unlicensed binary redirect to a frozen 2022 frontend and is not reusable.
- Anonymous first-party endpoints currently provide home, search, video
  details, and `play/options`. Sampled public VOD returned signed HLS sources;
  sampled live content returned HLS under `live_streams.hls`.
- Sampled media used AVC/AAC HLS. HEVC, VP9, DASH, active DRM, alternate audio,
  and encrypted HLS were not observed and therefore are not supported claims.
- The sampled content manifests contained no recognizable inserted-ad markers.
  The official player instead exposes separate VAST/player advertising
  orchestration. This observation is limited by network, region, account,
  content, and time.
- LG documents native HLS playback through HTML5 media on webOS 6, whose web
  engine is Chromium 79. CORS, signed-source expiry, codec support, and actual
  player behavior still require proof on the target television.
- A packaged app runs from a `file` origin and cannot assume browser cookie
  behavior. Authentication is deliberately outside the MVP.

## Decision

Build a clean-room **packaged custom webOS frontend**. Resolve anonymous public
RUTUBE content through isolated adapters and hand an unmodified compatible HLS
source to the native HTML5 `<video>` element.

This decision is accepted only far enough to implement and run the Phase 2
playback spike. It does not assert that source requests, CORS, media formats,
lifecycle handling, or long-duration playback work on the LG C1. Catalog UI
work remains gated by recorded real-device results.

Do not patch or redistribute the official TV frontend. Do not add a native
service, proxy, MSE player, root requirement, authentication module, or manifest
rewriter until observed behavior makes that complexity necessary.

### Alternatives considered

| Option | Decision | Reason |
| --- | --- | --- |
| Redirect-only hosted wrapper | Rejected | Recreates the official app without project-owned UX, diagnostics, or advertising behavior |
| Hosted wrapper with patches | Deferred fallback | Remotely changing DOM/bundle coupling and proprietary-code risk outweigh its cookie and proven-delivery advantages |
| Packaged custom frontend | Selected for spike | Concentrates volatile protocol knowledge in testable adapters and gives full control of playback, navigation, and diagnostics |
| Native/service-heavy client | Rejected for now | No evidence yet requires root, a proxy, a JavaScript service, or native media integration |

## Why this shape

The custom client gives the project locality: undocumented RUTUBE knowledge is
concentrated in adapters, media lifecycle knowledge in one player module, and
remote-navigation knowledge in one focus module. UI screens consume normalized
models and do not learn response fields, signed URL rules, player events, or
key-code quirks.

These are intended to be deep modules: callers use small interfaces while the
implementations absorb response normalization, cancellation, expiry, lifecycle,
and cleanup. The interfaces are also the test surfaces. No interface is added
for a dependency that does not yet vary.

There are two justified seams:

1. The true-external RUTUBE HTTP seam has a production fetch adapter and a
   sanitized-fixture adapter for contract tests.
2. The platform media seam has a native HTML media adapter and an in-memory fake
   adapter for player-state tests.

Other separations are modules, not speculative adapter systems. In particular,
there is no generic provider framework, repository abstraction, manifest
transformation pipeline, DRM plugin interface, or authentication interface.

## Module interfaces

The following describes caller-visible behavior, including invariants and
errors. Exact JavaScript syntax may evolve, but implementations must preserve
these narrow interfaces.

### `Catalog`

```text
home({ cursor?, signal }) -> Result<Page<VideoSummary>, CatalogError>
search({ query, cursor?, signal }) -> Result<Page<VideoSummary>, CatalogError>
details({ videoId, signal }) -> Result<VideoDetails, CatalogError>
```

`Catalog` owns endpoint selection, tolerant decoding, duration normalization to
milliseconds, pagination normalization, and cancellation. A video identifier
is the only RUTUBE locator exposed to other modules. Raw response objects and
continuation URLs never escape the module.

The first production adapter uses the currently observed first-party endpoints.
The fixture adapter replays dated, sanitized responses through the same
interface. Contract tests assert normalized outcomes and typed failures, not
private decoder functions.

### `PlaybackSources`

```text
resolve({ videoId, signal }) -> Result<PlaybackSource, SourceError>
```

`PlaybackSources` owns the fresh `play/options` request, VOD/live branching,
access and entitlement checks, source expiry metadata, HLS capability
inspection, mirror deduplication, and advertising classification. A successful
result contains only what the player needs:

```text
PlaybackSource {
  kind: "vod" | "live"
  url: ephemeral URL held in memory only
  manifest: "hls"
  seekable: boolean
  durationMs?: number
  qualities: Quality[]
  codecs: string[]
  expiresAt?: instant
  advertising: "none-observed" | "player-side" | "manifest-marked" | "unknown"
  warnings: SourceWarning[]
}
```

Signed URLs are never persisted, included in fixtures, or emitted to logs.
Callers do not choose response fields or inspect `video_balancer` and
`live_streams` directly.

### `Player`

```text
open(source) -> Promise<Result<PlayerSnapshot, PlayerError>>
command("play" | "pause" | SeekBy | SelectQuality) -> PlayerSnapshot
close(reason) -> PlayerSnapshot
subscribe(listener) -> unsubscribe
```

`Player` owns the HTML media element, event/listener cleanup, state transitions,
buffering, seek rules, source replacement, and visibility changes. It exposes
snapshots rather than raw DOM events. `close` is idempotent and always releases
media state. An expiry-like failure is returned to `AppFlow`, which may invoke
`PlaybackSources` once for a fresh location; the player has no hidden network
dependency. Native fullscreen video behavior provides playback-scoped
screensaver suppression; the module does not install a global keep-awake policy.

The production adapter wraps `<video>`. The fake adapter drives the same state
machine in automated tests. Manual quality selection remains optional until the
native-player spike proves a reliable implementation; automatic quality is the
baseline.

### `Navigation`

```text
mount(screenFocusModel) -> FocusSnapshot
handle(input) -> NavigationEffect
restore(location) -> FocusSnapshot
dispose() -> void
```

`Navigation` owns key codes, spatial focus, pointer-to-D-pad transitions, Back
precedence, focus restoration, held-key policy, and platform exit at the root.
Screens describe focusable locations and intended neighbours; they do not attach
independent global key handlers. Search uses a normal input so webOS can present
its virtual keyboard, and the module restores focus when text entry closes.

### `AppFlow`

```text
start() -> void
dispatch(intent) -> void
stop(reason) -> void
```

`AppFlow` is the composition module. It owns routes, stale-operation
cancellation, screen state, and orchestration from catalog selection to source
resolution to playback. It depends on the four module interfaces above plus the
existing diagnostics interface. Screens render state and emit intents; they do
not call RUTUBE or the media element directly.

Local settings stay inside `AppFlow` until a second consumer or implementation
justifies a storage seam. Authentication, account state, history,
recommendations, comments, likes, and subscriptions are outside the MVP.

### Dependency ownership and verification

| Dependency or concern | Owning module | Seam and adapters | Verification through the interface |
| --- | --- | --- | --- |
| Undocumented catalog/details JSON | `Catalog` | RUTUBE HTTP; fetch and fixture adapters | Dated fixture contract tests for normalized pages, details, cancellation, and errors |
| `play/options`, HLS metadata, signed URLs | `PlaybackSources` | RUTUBE HTTP; fetch and fixture adapters | Fixture contracts for VOD, live, access failures, expiry metadata, DRM, and unknown markers |
| HTML media and webOS lifecycle events | `Player` | Platform media; native `<video>` and in-memory fake adapters | State-transition tests plus the recorded LG C1 playback matrix |
| Remote keys, focus, pointer mode, virtual keyboard | `Navigation` | DOM/webOS event surface; no extra adapter until a second implementation exists | Focus-graph tests and remote-only device scenarios |
| Routing, cancellation, retry, source refresh | `AppFlow` | Module composition; no separate adapter | Integration tests through user intents and rendered outcomes |
| Redaction and structured events | existing diagnostics module | Injected log sink used by production and tests | Redaction/unit tests and release-log inspection |

Tests use these interfaces rather than reaching into decoders, DOM event
handlers, or state-machine internals. If an implementation refactor changes no
observable interface behavior, its tests should not need rewriting.

## Source and manifest error model

All external failures are returned as typed results. Expected remote or media
failures are not thrown through screen code.

| Error | Meaning | User recovery and diagnostics |
| --- | --- | --- |
| `cancelled` | A newer navigation or playback intent superseded the request | Silent; never shown as a failure |
| `offline` | Network unavailable before a response | Retry action; log sanitized network class |
| `timeout` | Bounded request or media-start deadline expired | Retry action; log operation and duration |
| `http` | Unexpected response status | Retry when appropriate; log status, never response secrets |
| `cors-rejected` | Packaged origin cannot reach a required resource | Terminal spike result; triggers architecture rollback review |
| `malformed-response` | JSON or required invariants are invalid | Terminal message; retain/update a sanitized fixture |
| `unavailable` | Deleted, geo-blocked, rights-blocked, private, or otherwise unavailable | Explain known reason without promising a retry |
| `paid` | Entitlement is required | Unsupported in MVP; do not attempt bypass |
| `drm-unsupported` | Active DRM or encryption requires an unimplemented legitimate flow | Unsupported in MVP; record scheme only |
| `source-missing` | No compatible VOD or live source is present | Terminal content error |
| `source-expired` | Signed source expired before/during startup | Resolve once more, then fail without a loop |
| `manifest-unsupported` | DASH, unsupported HLS feature, codec, or container is required | Terminal capability message with sanitized format data |
| `playback-failed` | The platform rejected or failed a compatible-looking source | Retry once only when safe; record native media code/state |

Unknown JSON fields are tolerated. Missing local invariants are not. An unknown
manifest or advertising marker produces a warning and preserves the original
source; it never triggers guessed segment deletion. If a marker makes the stream
incompatible with the native player, resolution returns
`manifest-unsupported` rather than rewriting the stream.

## Data flow

```text
remote/pointer intent
        |
        v
Navigation -> AppFlow -> Catalog -> RUTUBE HTTP
                         |
                    normalized video
                         |
                         v
               PlaybackSources -> play/options + HLS probe
                         |
                 typed source or error
                         |
                         v
                    Player -> native <video>
                         |
                snapshots / safe diagnostics
                         |
                         v
                      AppFlow -> screen state
```

Every route change cancels work that can no longer affect the visible screen.
Every playback exit calls `Player.close`, whether caused by Back, completion,
error, suspension, or app shutdown.

## Advertising and legal/product constraint

The implementation may select the direct content HLS source returned by
`play/options`; it will not initialize RUTUBE's separate VAST advertising path
and will not modify manifests based on timing, domains, or guessed markers.
This is an observed technical behavior, not an official ad-suppression contract.

RUTUBE's published partner rules say integrations should not disable or cover
player advertising, and RUTUBE sells an official ad-free subscription. Before
the project is publicly distributed or described as an ad blocker, a maintainer
must make and record a legal/product decision about whether this custom client
and its branding are acceptable. Until then:

- do not reuse or redistribute proprietary RUTUBE application code or assets;
- do not bypass DRM, access restrictions, payment, or authentication;
- do not claim that all advertising is removed;
- fail open to intact content playback when advertising classification is
  uncertain; and
- select a repository license before accepting copied code or publishing a
  release. Rupoop is MIT-licensed but remains a protocol reference only;
  `youtube-webos` is GPL-3.0-only and no code from it is used.

## webOS compatibility constraints

- Build/transpile for Chromium 79 and avoid relying on newer browser behavior
  without a tested polyfill.
- Use native HLS through `<video>` first. Do not add MSE or a player library
  unless a measured source or quality-control requirement demands it.
- The packaged `file` origin must pass on-device CORS checks for JSON, HLS
  masters, variants, and segments. Desktop success is insufficient.
- Treat signed media locations as short-lived in-memory capabilities. Resolve
  afresh for each playback and after the one allowed expiry refresh.
- Handle Back key code 461 explicitly because `disableBackHistoryAPI` is used;
  call `webOS.platformBack()` only at the application root.
- Treat `visibilitychange` as a lifecycle event. Suspend and resume must be
  idempotent; background JavaScript progress cannot be assumed.
- Do not implement playback rates other than 1.0 or simulated fast-forward.
- Respect webOS 6 HLS limits: unsupported `EXT-X-DATERANGE`, restricted
  discontinuities, matching media sequence numbers across renditions, and no
  `EXT-X-MEDIA` video assumption.
- Fullscreen video suppresses the screensaver during playback. Normal idle
  behavior must resume after close, failure, suspension, and exit.
- Keep the search layout usable above the system virtual keyboard and restore
  a deterministic focus location after it closes.

## Staged implementation map

1. **Contract foundation:** add sanitized fixtures for playable VOD, live,
   unavailable, paid, DRM, malformed, and marker-unknown shapes. Implement and
   test `Catalog` normalization and `PlaybackSources` through their interfaces.
2. **Single-video spike:** accept a public video ID, resolve a fresh source,
   inspect HLS without transforming it, and drive a native `<video>` element.
   Add safe source/player diagnostics and Back/cleanup handling.
3. **Real-device gate:** on the target LG C1 record exact device metadata,
   CORS/source behavior, start/pause/seek/Back, suspend/resume, source refresh,
   screensaver restoration, and a 30-minute run. This gate is pending.
4. **MVP vertical slices:** add `Navigation` and `AppFlow`, then Home to Details
   to Player, Search to Results to Player, errors/retry, replay, and consecutive
   playback. Implement automatic quality before attempting manual selection.
5. **Hardening:** expand observed codec/manifest coverage, bounded retries,
   cancellation, lifecycle cleanup, and the full device matrix. Only add
   alternate media or transport implementations when evidence creates a real
   second adapter.
6. **Release:** resolve the legal/product and project-license decisions, package
   an IPK, and document only device behaviors that have recorded results.

## Rollback and escalation conditions

Stop the custom-client path and run a bounded hosted-wrapper spike if any of the
following is reproducible on the LG C1 and cannot be fixed inside the existing
modules without a credential proxy, access bypass, or broad platform service:

- packaged-origin CORS prevents required anonymous catalog or media requests;
- native HTML media cannot reliably start, seek, resume, or sustain the
  representative public HLS sources;
- the anonymous public source flow is removed or requires unsupported DRM for
  the MVP content set; or
- signed-source refresh cannot recover normal expiry without playback loops.

The wrapper spike may proceed only if it can inject deterministically under
this project's own app identity, avoid proprietary asset/code copying, preserve
remote navigation and lifecycle cleanup, and use structural rather than
timing/domain guesses. Reject it if it relies on unstable DOM selectors,
privileged package fields, or impersonating the official app ID.

Consider a native/service-heavy architecture only after both the custom-client
device spike and the bounded wrapper spike fail for documented platform reasons.
That change requires a new ADR; it is not an implicit extension of this one.

## Consequences

The project gains control over TV UX, diagnostics, cleanup, and contract tests,
while containing volatile RUTUBE knowledge behind small interfaces. The cost is
owning the full remote UI and relying on undocumented catalog/source behavior.
Anonymous public playback can be pursued without root or account state, but
login and cookies are harder in a packaged app and remain deferred.

The decision deliberately leaves some capabilities unsupported instead of
guessing: DRM, paid content, authentication, manifest rewriting, and unobserved
formats return explicit outcomes. The architecture remains reversible at the
device gate without committing the MVP UI to a failed playback path.
