# Instructions for agents

## Mission

Build a small, observable, and maintainable open-source RUTUBE client or
modification for LG C1/webOS. The product must prioritize reliable playback,
Magic Remote navigation, and avoiding unnecessary advertising interruptions
without breaking the media stream.

Before relevant work, read:

1. `rutube_adfree_lg_c1_webos_codex_context.md` for the product brief.
2. `docs/implementation-plan.md` for phase order, gates, and test requirements.

Treat the documents above as the source of truth. Update the plan when evidence
changes a milestone or architectural decision; update this file only when an
agent-wide rule changes.

## Required workflow

Work through evidence gates in this order:

1. **Research:** identify existing webOS work, inspect current RUTUBE content and
   playback flows, classify ad delivery, and inspect Rupoop only as a protocol
   reference. Complete when the findings and reproducible evidence are recorded
   under `docs/`.
2. **Playback spike:** prove playback of representative public RUTUBE videos on
   the actual target TV before building the full UI. Complete when playback,
   pause, seek, Back, lifecycle behavior, and a 30-minute run have recorded
   device results.
3. **Architecture decision:** choose a thin wrapper, custom frontend, or
   service-heavy implementation from the evidence. Record the decision and its
   tradeoffs as an ADR. Prefer the smallest robust option.
4. **MVP:** implement catalog, search, details, fullscreen playback, remote
   navigation, quality selection, and graceful errors.
5. **Release:** harden lifecycle and playback, run the complete device matrix,
   write installation/debug documentation, and produce an `.ipk` when practical.

Do not report a later gate as complete while an earlier gate lacks its completion
evidence. Distinguish desktop, simulator/emulator, and real-device results in all
test reports.

## Platform and architecture rules

- Target LG OLED C1 running webOS. Record exact model suffix, firmware, webOS
  version, and region before adding platform-specific workarounds.
- Prefer Developer Mode or Homebrew installation. Introduce a root requirement
  only after documenting why wrapper and ordinary webOS approaches cannot meet
  the requirement.
- Do not mechanically port Rupoop or its Android UI. Use it to understand
  protocol behavior only, and verify current behavior against RUTUBE. Check its
  license before reusing any code.
- Keep content/API access, playback, focus/navigation, screens, storage, and
  diagnostics behind separate module boundaries.
- Isolate undocumented RUTUBE behavior behind adapters and cover observed
  response shapes with sanitized fixtures and contract tests.
- Determine whether advertising is frontend-, manifest-, or server-side before
  implementing suppression. Prefer verified structural signals over domain or
  timing guesses. If suppression is uncertain, preserve valid playback and emit
  a safe diagnostic event.
- Scope keep-awake behavior to active playback and always restore normal TV idle
  behavior when playback stops, fails, or the app is suspended.

## Security and observability

- Keep passwords, cookies, tokens, device codes, and secrets out of source,
  fixtures, commits, and logs.
- Prefer a supported device/QR authentication flow if authentication is added.
- Redact request headers, query parameters, response fields, and identifiers
  that can carry credentials or personal data before persistence.
- Optional debug logs should include app version/commit, TV and webOS version,
  sanitized request failures/status codes, selected source, manifest type,
  codec/resolution, player states, buffering, quality switches, and playback
  errors.
- Logs must be useful with debug mode disabled; debug mode may increase detail
  but must never weaken redaction.

## Verification rules

- Add unit tests for parsers, source/quality selection, player state transitions,
  focus navigation, and log redaction.
- Add fixture-based contract tests for every undocumented API response the app
  depends on.
- Add integration tests for Home/Search to Details to Player, stale-request
  cancellation, network failures, retries, replay, and consecutive playback.
- Test manifests containing adaptive variants, discontinuities, multiple audio
  tracks, quality changes, and any verified ad markers.
- Run the real-device matrix from `docs/implementation-plan.md` before declaring
  the MVP releasable. Record date, build commit, TV/firmware/webOS details,
  content identifier, expected result, actual result, and relevant sanitized
  logs.
- Never convert an unexecuted test, desktop result, or simulator result into a
  real-device pass.

## Definition of done

A change is done when its behavior is implemented, relevant automated checks
pass, device-dependent work is explicitly marked tested or pending, documentation
reflects changed behavior, logs contain no secrets, and `git status` contains no
unexplained generated artifacts.
