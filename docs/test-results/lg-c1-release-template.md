# LG C1 release acceptance record

Copy this file to `YYYY-MM-DD-lg-c1-release.md` for each candidate. Do not enter
IP addresses, account names, private keys, passphrases, cookies, tokens, signed
media URLs, or unique personal/device identifiers.

## Candidate and device

| Field | Value |
| --- | --- |
| Date/timezone | TODO |
| Source commit | TODO |
| App version | TODO |
| IPK filename | TODO |
| IPK SHA-256 | TODO |
| Provenance `sourceDirty` | TODO: `false`, or `null` plus separately recorded clean `git status --short` |
| webOS CLI version | TODO |
| Full LG C1 model suffix | TODO |
| Firmware version | TODO |
| webOS version | TODO |
| Region | TODO |
| Install path | TODO: Developer Mode/Homebrew |

## Install and lifecycle

| Check | Expected | Actual/log reference | Result |
| --- | --- | --- | --- |
| Clean install and launch after restart | Home opens | TODO | PENDING |
| In-place update | New version/commit launches | TODO | PENDING |
| Suspend/resume during playback | Pauses/resumes without duplicate media | TODO | PENDING |
| App exit/relaunch | Media/listeners released; relaunch clean | TODO | PENDING |
| Uninstall | App ID removed | TODO | PENDING |

## Remote-only product path

| Check | Expected | Actual/log reference | Result |
| --- | --- | --- | --- |
| Home/catalog | D-pad focus; pagination/empty/retry usable | TODO | PENDING |
| Search/keyboard | Query, results, keyboard dismissal | TODO | PENDING |
| Details | Metadata fits and Play is reachable | TODO | PENDING |
| Playback controls | Play/Pause, short/long seek, Back, replay | TODO | PENDING |
| Held keys/pointer | Throttled; no focus trap | TODO | PENDING |
| Error recovery | Offline/timeout retries; terminal errors are clear | TODO | PENDING |

## Media matrix

| Content ID (non-sensitive) | VOD/live | Video/audio codec | Resolution | Duration/operation | Expected | Actual/log reference | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TODO | TODO | AVC/AAC | SD | start/seek | Plays | TODO | PENDING |
| TODO | TODO | AVC/AAC | HD | quality adaptation | Plays | TODO | PENDING |
| TODO | TODO | AVC/AAC | Full HD | 30+ minutes | Stable | TODO | PENDING |
| TODO if served | TODO | HEVC | TODO | start | Graceful result | TODO | PENDING |
| TODO if served | TODO | VP9 | TODO | start | Graceful result | TODO | PENDING |
| TODO | live | observed | auto | live/DVR seek | Matches source capability | TODO | PENDING |

## Endurance, network, idle, and advertising

| Check | Expected | Actual/log reference | Result |
| --- | --- | --- | --- |
| Ten consecutive videos | No stale UI/listeners or growing failure | TODO | PENDING |
| Slow start | Bounded loading/retry | TODO | PENDING |
| Short disconnect/recovery | Clear retry and successful recovery | TODO | PENDING |
| Permanent failure | Clear terminal/retry state; no loop | TODO | PENDING |
| Active-playback idle | No unwanted screensaver/standby | TODO | PENDING |
| Idle after stop/error/suspend | Normal TV idle restored | TODO | PENDING |
| Advertising | Matches ADR without stream corruption | TODO | PENDING |
| Sanitized logs | Useful; no secrets/PII/signed URLs | TODO | PENDING |

## Decision

- Release accepted: TODO yes/no
- Explicit exceptions/known limitations: TODO
- Sanitized evidence location: TODO
