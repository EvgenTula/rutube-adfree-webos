# Player module

**Implemented:** 2026-10-07

**Environment verified:** local Node.js behavior tests

**LG C1 status:** `PENDING`

The Player is the sole owner of the HTML media element and its event stream. It
accepts a normalized `PlaybackSource`, exposes immutable snapshots, and keeps
the signed media URL only in the in-memory Player session and media adapter.
Snapshots, command errors, and Player diagnostics never contain that URL.

## Interface

```text
open(source) -> Promise<Result<PlayerSnapshot, PlayerError>>
command("play" | "pause" | SeekBy | SeekTo | SelectQuality
        | SetVolume | SetMuted) -> Result<PlayerSnapshot, PlayerError>
close(reason) -> PlayerSnapshot
subscribe(listener) -> unsubscribe
snapshot() -> PlayerSnapshot
```

`open` resolves successfully only after the media element reports `playing`.
Autoplay rejection, native error, source expiry, and the bounded 15-second
startup deadline return typed failures. Replacing a source resolves the prior
pending open as `cancelled`; commands issued before `open` settles return
`invalid-state`; close and unsubscribe are idempotent.

The state set is `loading`, `ready`, `playing`, `paused`, `buffering`, `ended`,
`error`, and `closed`. Terminal completion and failure detach all native media
and visibility listeners and unload the element. External snapshot listeners
remain owned by their returned unsubscribe function so a composition root can
observe multiple sessions without resubscribing.

## Playback and lifecycle rules

- VOD seeking is clamped to zero and the known duration.
- A live source with `seekable: false` returns `seek-unsupported`.
- A DVR/live source clamps seeks to the native seekable ranges, including gaps.
- Native HLS automatic adaptation is the only supported quality mode. Selecting
  a concrete variant returns `quality-unsupported` with
  `mode: native-hls-auto`; it never pretends to switch quality.
- Hiding the document pauses an active session without discarding its source.
  Visibility resumes only a session that was playing or starting before it was
  hidden. A manually paused session remains paused. Startup time while hidden is
  excluded from the bounded startup deadline.
- The native adapter applies the `player-media-active` class to the video only.
  It does not install a document-wide keep-awake policy. Unload removes the
  class, source, and native listeners.

The production seam is `createNativeMediaAdapter(videoElement)`. The matching
test-only in-memory seam is `createFakeMediaAdapter()`, which drives the same
Player interface without exposing DOM events to callers and is excluded from
the packaged application.

## Typed errors

Player operations currently return `invalid-source`, `cancelled`,
`autoplay-rejected`, `timeout`, `source-expired`, `playback-failed`,
`invalid-state`, `invalid-command`, `seek-unsupported`, or
`quality-unsupported`. Native exception messages and source locations are not
included.

## Remaining device evidence

The local tests do not prove packaged-origin media access, native HLS startup,
actual LG seekable ranges, suspend/resume behavior, codec support, screensaver
behavior, or memory stability. Those remain part of the LG C1 matrix and must
not be reported as passed until recorded on the television.
