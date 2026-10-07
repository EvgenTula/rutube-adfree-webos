# RUTUBE AdFree for LG C1 / webOS --- context for Codex

## Goal

Research and implement an open-source RUTUBE client/modification for
**LG C1 (webOS)** aimed at reliable RUTUBE playback without advertising
interruptions, similar in spirit to `webosbrew/youtube-webos`.

Do not assume an Android app can be directly ported to webOS.

## Target

-   LG OLED C1, webOS.
-   Collect exact model suffix, firmware and webOS version before
    platform-specific fixes.
-   Prefer Developer Mode / Homebrew installation.
-   Avoid requiring root unless technically necessary.

## References

### YouTube AdFree

https://github.com/webosbrew/youtube-webos

Use as a reference for webOS packaging, LG remote navigation, playback
integration, patches/hooks and distribution. Do not reuse
YouTube-specific assumptions blindly.

### RUTUBE

https://rutube.ru/

RUTUBE has an official Smart TV/webOS experience. Determine whether the
best solution is: 1. a wrapper/patch around the existing TV/web
frontend; 2. a custom webOS client using currently reachable RUTUBE
endpoints; 3. another maintainable architecture.

Prefer the smallest robust solution.

### Rupoop

https://github.com/santiago43rus/Rupoop

Unofficial Android RUTUBE client. It is **not** a webOS application. Use
it only as a research reference for content discovery, search, metadata,
playback-source retrieval, subscriptions/history concepts and request
structure. Verify everything against current RUTUBE and check its
license before reusing code.

## Phase 1 --- research

Before coding, search GitHub and webOS Homebrew for existing RUTUBE
webOS/LG/Smart-TV clients or mods.

Inspect the current RUTUBE TV/web application and determine: -
app/frontend architecture; - authentication flow; - catalog/search/video
metadata endpoints; - playback URL/manifest retrieval; - HLS/DASH use; -
codecs used on LG C1; - where ads are introduced:
frontend/player/manifest/server-side stream.

Do not choose an ad-removal technique until the delivery mechanism is
understood.

Inspect Rupoop and map protocol-level behavior (not Android UI) for: -
home feed; - search; - video details; - playback source; - HLS/DASH; -
authentication; - subscriptions/history; - recommendations/comments; -
ad handling.

## MVP

Required: - launches on LG C1; - usable Magic Remote navigation; -
catalog/home; - search; - video details; - reliable fullscreen
playback; - play/pause, seek and Back; - automatic or selectable
quality; - graceful errors; - no unnecessary advertising interruptions
where achievable without breaking playback.

Later: login, subscriptions, history, likes, comments, recommendations
and supported QR/device authentication.

## LG C1 playback tests

Test H.264/AVC, HEVC and VP9 where served, audio codecs, multiple
resolutions, adaptive quality switches, seeking, long videos,
consecutive videos, suspend/resume and screen-saver/idle behavior.

Do not globally disable normal TV idle/standby behavior. Any keep-awake
mechanism should be scoped to active playback.

## Architecture order

**A. Thin webOS wrapper/patch** --- prefer if the existing RUTUBE TV
frontend is suitable. Smallest and fastest, but DOM/frontend changes may
break patches.

**B. Custom webOS frontend** --- use if content/playback endpoints are
sufficiently stable. Better TV UX control but more work and more
exposure to undocumented API changes.

**C. Native/service-heavy solution** --- only if A/B cannot deliver
reliable C1 playback.

## Debugging

Optional debug logging should include app commit/version, TV/webOS
version, request failures/status codes, selected playback source,
manifest type, codec/resolution, player states, buffering, quality
switches and playback errors.

Never log credentials, cookies, auth tokens or secrets.

## Authentication/security

Do not put passwords or tokens in source/config. Prefer supported
device/QR authentication if available. Redact secrets from logs and
never commit credentials.

## Deliverables

1.  Research notes on current RUTUBE content/playback architecture.
2.  Architecture decision with rationale.
3.  Minimal runnable webOS app.
4.  LG C1 installation instructions.
5.  Debug instructions and known limitations.
6.  Test matrix/results.
7.  Clean Git repository.
8.  Installable `.ipk` if practical.

## Acceptance criteria

On LG C1: 1. installs and launches; 2. remote navigation works; 3.
search returns RUTUBE videos; 4. selected videos start reliably; 5.
playback runs at least 30 minutes without unexplained failure; 6.
seeking works; 7. multiple consecutive videos work; 8. quality switching
does not crash playback; 9. active playback does not incorrectly trigger
screen saver/standby; 10. advertising interruptions are absent/reduced
according to the chosen architecture without breaking playback; 11.
normal TV behavior outside playback remains intact.

## Instruction to Codex

Do **not** mechanically port the Rupoop Android UI.

Start by: 1. finding existing webOS/RUTUBE work; 2. identifying the
current content and playback flow; 3. proving reliable RUTUBE video
playback on LG C1/webOS; 4. choosing wrapper vs custom client from
evidence; 5. only then building the TV UI.

Keep the first implementation small, observable and testable.
