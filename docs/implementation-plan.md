# RUTUBE AdFree for LG C1/webOS: implementation and test plan

## Delivery strategy

Build in the order **research -> device playback proof -> architecture decision
-> MVP -> stabilization -> package**. UI work starts only after representative
RUTUBE playback is proven on the target LG C1.

## Phase 0: repository and target baseline

### Work

- Record the TV's complete model suffix, firmware, webOS version, and region.
- Confirm Developer Mode/Homebrew availability and the preferred installation
  path.
- Create the minimal webOS application skeleton, build command, and local test
  command.
- Add versioned instructions for build, install, launch, and log collection.
- Establish sanitized structured logging and a debug-mode switch.

### Exit criteria

- A minimal package builds, installs, and launches on the target LG C1.
- Device metadata and exact reproduction commands are recorded under `docs/`.

## Phase 1: current-system research

### Work

- Search GitHub and webOS Homebrew for existing RUTUBE webOS/LG/Smart TV clients
  and modifications.
- Inspect the current official RUTUBE TV/web frontend, including navigation,
  authentication, catalog, search, details, source retrieval, and playback.
- Map reachable endpoints, request requirements, response shapes, HLS/DASH use,
  DRM if present, and codecs delivered to LG C1.
- Determine whether ads originate in frontend code, a player/SDK, manifest
  periods or segments, redirects, or server-side stream insertion.
- Inspect Rupoop's protocol behavior for home, search, details, sources,
  authentication, history/subscriptions, recommendations, and ad handling.
  Record its license before reusing code.
- Build a sanitized fixture set and representative content matrix: short/long,
  live/VOD where supported, SD/HD/Full HD, and each observed codec/manifest type.

### Deliverables

- `docs/research.md` with dated sources and reproducible observations.
- Endpoint/response and content/codec matrices.
- Sanitized JSON and manifest fixtures.
- A precise classification of the advertising delivery mechanism.

### Exit criteria

- Another developer can reproduce source retrieval for the test content without
  credentials committed to the repository.
- The evidence is sufficient to implement a single-video playback spike.

## Phase 2: real-device playback spike

### Work

- Build a minimal screen that accepts or embeds a public test video identifier.
- Resolve its playback source through an isolated API adapter.
- Implement fullscreen playback with Play/Pause, seek, Back, completion, and
  error handling.
- Log manifest type, selected variant, codec/resolution, player state,
  buffering, quality changes, and sanitized errors.
- Handle source timeout, unavailable video, malformed response, and playback
  failure.
- Scope keep-awake to active playback and restore idle behavior on stop, error,
  Back, and suspend.
- Exercise suspend/resume and app relaunch on the television.

### Exit criteria

- Representative videos start reliably on the actual LG C1.
- Seek and Back work, a 30-minute run completes without unexplained failure, and
  the result is recorded with device/build metadata.
- Unsupported media types fail gracefully with actionable diagnostics.

## Phase 3: architecture decision

Evaluate the options in order:

1. **Thin wrapper/patch:** choose when the official TV frontend is usable,
   remote-friendly, and can be adapted without fragile DOM coupling.
2. **Custom webOS frontend:** choose when content and playback interfaces are
   sufficiently stable and the wrapper cannot provide a reliable TV UX.
3. **Native/service-heavy design:** choose only when the first two cannot deliver
   reliable C1 playback.

Compare playback reliability, DOM/API coupling, remote UX, ad-control viability,
maintenance cost, authentication, packaging, and any root requirement. Record
the choice, rejected alternatives, evidence, and rollback conditions in an ADR.

### Exit criterion

- The ADR is accepted and every core dependency has an owner, adapter boundary,
  and verification approach.

## Phase 4: MVP

Implement in vertical slices:

1. App shell, routes, focus manager, and Magic Remote key handling.
2. Home/catalog with loading, empty, and retry states.
3. Search, results, and webOS text-entry behavior.
4. Video details and source resolution.
5. Fullscreen player with controls and automatic/manual quality.
6. Back-stack behavior, cleanup, replay, and consecutive videos.
7. User-facing errors with safe diagnostics.

Keep login, subscriptions, history, likes, comments, recommendations, and device
authentication outside the first MVP unless research proves one is required for
basic catalog or playback.

### Exit criteria

- The complete Home/Search -> Details -> Player path is usable with the remote.
- Multiple consecutive videos work without stale state or listener buildup.
- Every MVP error mode has a recovery path or a clear terminal message.

## Phase 5: advertising behavior

Implement only the strategy supported by Phase 1 evidence:

- omit frontend advertising UI/SDK behavior in a custom client;
- filter manifest periods/segments only when structural markers are unambiguous;
- validate timestamp, discontinuity, audio-track, seek, and quality-switch
  behavior after any manifest transformation;
- treat server-side insertion as removable only after a repeatable safe method is
  demonstrated;
- fail open to valid playback when suppression confidence is insufficient.

### Exit criteria

- Advertising interruptions are absent or reduced according to the ADR, with no
  regression in playback start, seeking, adaptation, or long-run stability.
- Limitations and known content exceptions are documented.

## Phase 6: stabilization and release

- Add bounded timeout/retry behavior and stale-request cancellation.
- Release media resources and event listeners after every playback session.
- Verify memory behavior across at least ten consecutive videos.
- Complete installation, update, uninstall, debug, and troubleshooting docs.
- Produce an installable `.ipk` when practical and record its source commit.
- Document supported firmware/webOS versions and known limitations.

## Automated test plan

### Unit tests

- API/manifest parsing and schema fallbacks.
- Playback-source and quality selection.
- Player state transitions and cleanup.
- Focus graph and remote key mapping.
- Advertising-marker classification where applicable.
- Credential and personal-data redaction.

### Contract tests

- Replay sanitized API fixtures for every relied-upon response shape.
- Detect missing required fields and return typed, user-actionable failures.
- Keep fixture provenance/date so stale assumptions are visible.

### Integration tests

- Home -> Details -> Player and Search -> Results -> Player.
- Network timeout, retry, offline recovery, and request cancellation.
- Back during loading and playback.
- Replay and ten consecutive playback sessions.
- Player cleanup after completion, error, navigation, and suspend.

### Manifest tests

- HLS and DASH when served.
- Master/media playlists and adaptive variants.
- Discontinuities and quality switches.
- Multiple audio tracks/codecs.
- Verified ad markers and unchanged content-only manifests.

## LG C1 real-device matrix

| Area | Required coverage |
| --- | --- |
| Video | H.264/AVC, HEVC, and VP9 where RUTUBE serves them |
| Audio | Every audio codec observed in representative sources |
| Resolution | SD, HD, Full HD, auto quality, and manual selection |
| Controls | Play/Pause, short and long seek, Back, replay |
| Duration | At least one 30+ minute run and one long-form video |
| Repetition | At least ten consecutive videos |
| Adaptation | Bandwidth changes and repeated quality switches |
| Network | Slow start, short disconnect, recovery, permanent failure |
| Lifecycle | Suspend/resume, relaunch, completion, application exit |
| Idle behavior | No screensaver during active playback; normal idle afterward |
| Remote | D-pad, OK, Back, held keys, and absence of focus traps |
| Advertising | Expected suppression/reduction with playback intact |

Each result records date, application commit/version, TV model suffix, firmware,
webOS version, region, content identifier, source/manifest type, expected result,
actual result, pass/fail, and relevant sanitized log reference.

## Release acceptance run

1. Install a clean package and launch after a TV restart.
2. Navigate the catalog using only the remote.
3. Search for a video and open its details.
4. Play for at least 30 minutes.
5. Seek repeatedly and change quality.
6. Return and play multiple additional videos.
7. Suspend and resume during playback.
8. Stop playback and verify normal idle behavior returns.
9. Confirm advertising behavior matches the documented architecture.
10. Inspect logs for unexplained errors and any leaked sensitive data.

Release is accepted only when all applicable original acceptance criteria have a
recorded real-device result; exceptions must be explicit known limitations.
