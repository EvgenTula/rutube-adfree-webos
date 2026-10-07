# Anonymous MVP

**Implemented:** 2026-10-07

**Environment verified:** local Node.js behavior/fixture tests and webOS build
validation

**LG C1 status:** `PENDING`

## User-visible flow

The application starts on an anonymous home catalog. A remote user can move
through the responsive card grid, load another page, open video details, start
native fullscreen HLS, pause/resume, seek backward 15 seconds or forward 30
seconds, dismiss and reopen controls from the remote, leave playback, and
replay an ended video.

Search uses a normal HTML input so webOS can display its system virtual
keyboard. The layout reserves its lower region, horizontal arrows remain text
cursor controls while editing, and Back first dismisses text input. The next
Back returns to Home. At the root, Back calls `webOS.platformBack()` when
available and falls back to closing the application window.

The player reports native HLS quality as automatic. A manual quality chooser is
deliberately absent: the Player contract rejects concrete quality selection,
and the UI never claims to perform a switch it cannot verify.

## Module behavior

- `Navigation` owns D-pad/OK/Back mapping, deterministic spatial focus,
  pointer-to-D-pad transitions, throttled held arrows, ignored held OK/Back,
  focus restoration per route, text input precedence, and listener cleanup.
- `AppFlow` owns the Home, Search, Details, and Player routes. It cancels stale
  requests with `AbortController`, retries transient operations at most once,
  exposes a user retry action, refreshes an expired media capability at most
  once, and closes the Player whenever playback is left or the app stops.
- Terminal access, payment, DRM, malformed-source, and unsupported-format
  outcomes show an explanatory message without a misleading Retry action;
  transient network/media failures keep a bounded user retry path.
- `DomRenderer` uses `textContent` for remote strings and accepts only the
  Catalog's normalized HTTP(S) thumbnail URL. It never inserts remote HTML.
- `Player` remains the sole owner of `<video>`. The app does not embed the
  official player, load VAST, rewrite HLS, or install a global keep-awake
  policy.

Diagnostics record operations, result classes, counts, player state, manifest
type, and safe source characteristics. They do not include signed source URLs,
request URLs, response bodies, cookies, tokens, or native exception messages.

## Desktop preview boundary

`npm run dev` first builds `dist`, then starts a dependency-free server on
`127.0.0.1:4173`. Only these anonymous upstream GET paths are allowlisted:

- `/api/v2/video/recommendation/main`
- `/api/search/combined/video_playlist`
- `/api/video/{public-video-id}/`
- `/api/play/options/{public-video-id}/`

The proxy rejects incoming Cookie and Authorization headers, forwards neither,
does not follow redirects, and is never copied into the application package.
Signed CDN media stays direct. Production requests are direct as required by
ADR 0001.

## Remaining evidence

Local tests do not prove the LG C1's packaged-origin JSON/media access, native
codec support, actual Magic Remote behavior, keyboard layout, playback start,
seek ranges, suspend/resume, screensaver behavior, memory use, or long-run
stability. The exact device profile and complete matrix remain required before
calling the MVP releasable.
