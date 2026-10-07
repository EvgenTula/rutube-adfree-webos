# Compatibility and support status

## Target baseline

The implementation target is LG OLED C1 on webOS 6. LG documents that platform
with a Chromium 79 web engine. Shipped JavaScript and CSS therefore avoid
optional chaining, nullish/logical assignment, post-Chromium-79 built-ins,
flexbox `gap`, and `color-scheme`. `npm run check:compat` enforces these known
source constraints.

The native HTML5 media element is used for HLS. Local contracts currently accept
unencrypted AVC/AAC HLS observed in sanitized RUTUBE samples. HEVC, VP9, DASH,
DRM, encrypted HLS, and manual quality control are not claimed as supported.
Unknown or marked manifests are never rewritten.

## Verified environments

| Environment | Status |
| --- | --- |
| Node.js 20, 22, 24 | CI configuration; local verification depends on the recorded test run |
| LG webOS CLI 3.2.6 | Pinned development dependency; local IPK packaging verified |
| Desktop preview | Development aid only; does not prove TV behavior |
| LG C1 firmware/webOS combinations | None verified yet |

There is no supported-firmware claim until a dated device record contains the
full model suffix, firmware, webOS version, and region. The expected first
candidate is an LG C1 running webOS 6, but the exact firmware remains unknown.

## Device-dependent unknowns

- packaged `file`-origin access to required RUTUBE JSON, HLS masters, variants,
  and segments;
- native HLS startup, codecs, audio tracks, seekable/DVR ranges, and adaptation;
- Magic Remote, pointer, held-key, Back, and virtual-keyboard behavior;
- suspend/resume, relaunch, Developer Mode lifetime, and screensaver/idle rules;
- 30-minute playback, long-form playback, ten-session memory behavior, and
  network interruption recovery;
- advertising behavior for the tested region, network, account state, content,
  and time.

Record these in a copy of [the device profile](device-profile.md) and the
[release matrix template](test-results/lg-c1-release-template.md). A package or
desktop pass must never be promoted to a firmware-support claim.
