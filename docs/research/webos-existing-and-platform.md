# Existing RUTUBE webOS work and LG webOS 6 platform constraints

**Research date:** 2026-10-07

**All linked online sources accessed:** 2026-10-07

**Scope:** existing RUTUBE clients/wrappers for LG webOS/Smart TV, relevant
webOS 6 capabilities, and the wrapper-versus-custom-client decision. This
report does not classify RUTUBE advertising or document its content/playback
APIs; those are separate Phase 1 work.

## Executive conclusion

RUTUBE already ships an official LG webOS application, and inspection of the
official `.ipk` shows that it is a **hosted web app**: the installed package
contains metadata, images, and a tiny `index.html` that redirects to a
RUTUBE-hosted webOS frontend. This directly proves that a hosted frontend is a viable
way to deliver the official RUTUBE TV experience on the LG C1.

No maintained open-source RUTUBE client or ad-removing RUTUBE modification was
found in the official webOS Homebrew catalog. One third-party binary wrapper
was found, but it only redirects to RUTUBE's frozen 22.0.0 TV frontend, has no
advertising-control code, publishes no corresponding source, and has no
declared license. It is not a reusable implementation.

For this project, a pure redirect wrapper is not a useful product: it would
recreate the official application without adding reliable control over UI,
observability, or advertising behavior. The recommended target is therefore a
**packaged custom webOS frontend with isolated RUTUBE adapters and native HTML5
media playback**, conditional on the remaining protocol research proving that
catalog, search, metadata, and playback-source retrieval work without private
credentials. The official hosted frontend should be retained as a
compatibility oracle and fallback experiment, not patched as the primary
architecture. A service/native component is not justified by current
evidence.

## Method and reproducibility

Primary sources were preferred: RUTUBE's official distribution pages and
binary, LG's official developer documentation, and source repositories. GitHub
search was used for discovery; claims about discovered projects were then
checked against repository contents or packages.

The two RUTUBE packages were downloaded and inspected as `ar`/tar-compatible
IPK archives. On Windows with the bundled `tar.exe`, the essential steps are:

```powershell
curl.exe -L -o ru.rutube.webos.ipk `
  https://promo.rutubelist.ru/distr/ru.rutube.webos.ipk
Get-FileHash ru.rutube.webos.ipk -Algorithm SHA256
tar -xf ru.rutube.webos.ipk -C extracted
tar -xzf extracted/data.tar.gz -C extracted/data
```

The official endpoint rejected a generic command-line client with HTTP 403 but
returned the TV application when requested with LG's documented webOS 6 user
agent. This was reproduced with:

```powershell
curl.exe -L `
  -A "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager" `
  https://rutube.ru/tv-release/webos.server/webos/
```

Negative repository searches are snapshots, not proof that no project exists.
The official Homebrew catalog was checked at commit
[`f0ce95b`](https://github.com/webosbrew/apps-repo/tree/f0ce95b30b4f729d3a80b8d731c4687b594387f4)
with a recursive, case-insensitive search for `rutube` and `rupoop`; it returned
no matches under `packages/` or `content/`.

## Existing RUTUBE applications and wrappers

### 1. Official RUTUBE Smart TV application

RUTUBE's [current application page](https://rutube.ru/app/) directs LG users to
LG Content Store and says the application is available on LG televisions with
webOS 3.0 or newer. RUTUBE also publishes a direct webOS `.ipk` on its
[Smart TV distribution page](https://rutube.ru/info/smarttv/). A separate
official [functional and installation description](https://promo.rutubelist.ru/distr/%D0%9E%D0%BF%D0%B8%D1%81%D0%B0%D0%BD%D0%B8%D0%B5_%D1%82%D0%B2-%D0%BF%D1%80%D0%B8%D0%BB%D0%BE%D0%B6%D0%B5%D0%BD%D0%B8%D1%8F.pdf)
says webOS 1.0 or newer. The two support statements conflict, so webOS 3.0 is
the safer public minimum; either statement includes the LG C1/webOS 6 target.

Inspection of the official download produced the following facts:

| Property | Observed value |
| --- | --- |
| Download | `https://promo.rutubelist.ru/distr/ru.rutube.webos.ipk` |
| SHA-256 on 2026-10-07 | `4561C8A38F459115F0F88F6656DF37BF80F042FF8408A0C30B64140D1C3DA456` |
| Package/app ID | `ru.rutube.webos` |
| Version | `34.0.0` |
| App type | `web` |
| `handlesRelaunch` | `false` |
| `disableBackHistoryAPI` | `true` |
| Installed application payload | `appinfo.json`, `index.html`, icons, splash image |
| Remote entry point | `https://rutube.ru/tv-release/webos.server/webos/` |

The package's `index.html` only assigns the remote entry point to
`location.href`. This is exactly the hosted-app architecture described by LG's
[Web App Types documentation](https://webostv.developer.lge.com/develop/getting-started/web-app-types):
an installed dummy package redirects to content maintained on a remote server.

With the documented webOS 6 user agent, the remote entry point returned HTTP
200, a 574-byte HTML shell, and versioned `main.00f679e3.js` and
`main.00f679e3.css` assets. Its response reported `Last-Modified: Thu, 01 Oct
2026 10:18:30 GMT`. Therefore the installed IPK and remotely updated frontend
are deliberately decoupled. This makes the official UI cheap to update but
also means that a modification coupled to its DOM, asset names, or internal
JavaScript can change without an IPK update.

The official document describes search, home/recommendations, categories,
live TV, QR-code/account linking, quality selection, subtitles, seeking, and
recommendations in the TV application. It is useful as a product-behavior
reference, but it does not publish implementation source or a software license.
The downloaded package must therefore be treated as proprietary: inspect
behavior for interoperability, but do not copy or redistribute its assets or
code.

### 2. Official webOS Homebrew catalog

The [webosbrew/apps-repo](https://github.com/webosbrew/apps-repo) repository is
the central catalog for the webOS Homebrew project. At commit `f0ce95b` it had
no RUTUBE/Rupoop package or catalog content. The catalog itself is Apache-2.0,
but that license covers the catalog project, not arbitrary applications linked
from it.

Implication: there is no verified, maintained RUTUBE implementation in the
main Homebrew channel that this project can install, fork, or submit fixes to.

### 3. `wals09/repo` RUTUBE package

The third-party [`wals09/repo`](https://github.com/wals09/repo/tree/12dd156c2c6a250d8ea4e372a598d1bb78314ac4/rutube)
contains a binary RUTUBE package and
[`rutube.manifest.json`](https://github.com/wals09/repo/blob/12dd156c2c6a250d8ea4e372a598d1bb78314ac4/rutube/rutube.manifest.json).
The manifest declares:

| Property | Observed value |
| --- | --- |
| Package/app ID | `com.rutube.ru` |
| Version | `1.0.0` |
| Type | `web` |
| Root required | `false` |
| Source URL | a Telegram chat, not source code |
| Declared SHA-256 | `C1E4E981941ACB046AF45338EDBF5053B600902FC12DE589D96098877446D3C6` |

The downloaded binary matched the declared hash. Its payload contains only
`appinfo.json`, `index.html`, CSS, and images. The HTML immediately redirects
to `https://rutube.ru/tv-release/rutube.server-22.0.0/webos/`. That endpoint
still returned HTTP 200 with a webOS 6 user agent on 2026-10-07, but reported
`Last-Modified: Fri, 13 May 2022 10:39:06 GMT` and loads
`main.22-0-0.js`. There is no request filtering, manifest processing, player
replacement, or ad-removal logic in the installed package.

The repository has no root license and provides no corresponding source for
the binary. Consequently:

- it offers evidence that a no-root hosted wrapper can launch RUTUBE;
- it does not offer maintainable source or an advertising strategy;
- its old fixed frontend path is a compatibility and security-maintenance risk;
- none of its code/assets should be reused without explicit permission.

### 4. `webosbrew/youtube-webos` as an architectural reference

[`webosbrew/youtube-webos`](https://github.com/webosbrew/youtube-webos/tree/f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914)
is relevant as a pattern, not as a RUTUBE implementation. Its
[`utils.js`](https://github.com/webosbrew/youtube-webos/blob/f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914/src/utils.js)
redirects to the official YouTube TV page, while a bundled
[`webOSUserScripts/userScript.js`](https://github.com/webosbrew/youtube-webos/blob/f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914/src/userScript.ts)
installs hooks and UI modifications into that hosted application. Its
[`adblock.js`](https://github.com/webosbrew/youtube-webos/blob/f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914/src/adblock.js)
removes explicitly named ad structures from parsed YouTube responses. This is
structural filtering tied to known YouTube response shapes, not a generic
domain blacklist.

Important differences prevent treating it as a drop-in template:

- its package metadata uses the official YouTube app ID and privileged/vendor
  fields; its README requires uninstalling the official YouTube app;
- its hooks are tightly coupled to YouTube TV response and UI structures;
- it actively transpiles/polyfills for older TV engines, illustrating that TV
  browser compatibility must be a build concern;
- it is licensed
  [`GPL-3.0-only`](https://github.com/webosbrew/youtube-webos/blob/f1b3b72926bb0cc312b5ceddc6a5b8c8ca081914/LICENSE).

This repository currently has no project license of its own. Until one is
selected, copy no GPL-covered implementation code. Even after licensing,
copying would require GPL compatibility and compliance. Protocol-level and
architectural lessons may be independently reimplemented.

## LG C1 / webOS 6 implementation constraints

### Runtime and web application model

LG identifies webOS TV 6.x as the 2021 platform and documents its application
engine as Chromium 79 in
[Web API and Web Engine](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine).
The LG C1 target should therefore be built and transpiled for Chromium 79,
without assuming current desktop-browser syntax or APIs. The exact television
model suffix, firmware, region, and reported webOS/SDK versions still need to
be captured from the physical device before platform-specific workarounds are
accepted.

LG supports two relevant application forms:

- a **packaged web app**, whose HTML/CSS/JavaScript ships inside the IPK; and
- a **hosted web app**, whose local shell redirects to a remote web server.

LG notes that hosted-app performance depends on the network and server, while
packaged changes require a new package. More importantly, the web-engine
documentation states that only HTTP/HTTPS hosted web apps can use cookies;
cookies are not supported for packaged apps running from the `file` scheme.
This matters if RUTUBE login or playback relies on first-party cookies. A
custom packaged client should not assume browser-session cookie behavior and
must not invent credential storage; authentication remains out of MVP unless a
supported device/QR flow is verified.

webOS follows normal CORS rules, so a packaged frontend cannot bypass RUTUBE
server policy merely because it runs on a TV. Required API origins and request
headers must be verified on device. A JS service or proxy should not be added
solely to evade CORS without first documenting the security, deployment, and
maintenance consequences.

### Packaging, installation, and debugging

LG's current [webOS CLI](https://webostv.developer.lge.com/develop/tools/cli-introduction)
provides `ares-package`, `ares-setup-device`, `ares-install`, `ares-launch`,
`ares-inspect`, and device-information commands. LG deprecated the separate
legacy "webOS TV CLI" in March 2024, so new documentation and automation should
target `@webos-tools/cli`, not the retired bundle.

The official
[Developer Mode workflow](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app)
supports packaging, installing, launching, and inspecting apps on a real TV
without root. It requires an LG Developer account, a TV and PC on the same
network, port 9922/user `prisoner`, Key Server pairing, and a limited developer
session. When that session expires and Developer Mode is disabled, developer
apps are uninstalled. `ares-extend-dev` can extend a still-active session.

Implications for this project:

- Developer Mode is sufficient for development and the playback spike;
- root/Homebrew is not justified for the MVP;
- the test procedure must record session state and expect sideloaded builds to
  disappear after Developer Mode expiry;
- Simulator results cannot replace device playback results: LG explicitly
  states that simulator audio/video specifications differ from a TV device.

### Magic Remote, focus, Back, and text input

LG's [Magic Remote guide](https://webostv.developer.lge.com/develop/guides/magic-remote)
defines the core key codes: arrows 37-40, OK 13, and Back 461. Moving from
pointer mode to an arrow key changes the remote into five-way mode. A custom TV
UI therefore needs a deterministic spatial focus graph that stays coherent
when the user alternates pointer and D-pad input; ordinary desktop tab order is
not enough.

The [Back Button guide](https://webostv.developer.lge.com/develop/guides/back-button)
supports two approaches: DOM History API handling, or setting
`disableBackHistoryAPI: true` and handling key 461. On webOS 6 or newer,
`webOS.platformBack()` at the entry screen invokes the platform exit prompt.
Whichever model is chosen must cover player-controls dismissal, player exit,
details-to-list navigation, and final application exit consistently.

The system [virtual keyboard](https://webostv.developer.lge.com/develop/guides/virtual-keyboard)
opens automatically when a normal `<input>` receives focus, occupies roughly
the lower third of the display, and cannot be disabled programmatically. The
search layout must reserve space and restore focus after the keyboard closes.

### Playback capabilities and hazards

LG's
[Streaming Protocol and DRM specification](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm)
documents native HTTP/HTTPS and HLS playback, seeking, and live seeking. It
does not support fast-forward/reverse playback modes or playback rates other
than 1.0. On webOS 6, LG documents HLS version 7, MSE/EME, PlayReady 4.0,
Widevine Modular 16, and AES-128 HLS.

The same specification identifies constraints important to any ad or manifest
handling:

- audio and video segment durations should match;
- `EXT-X-DATERANGE` is not supported by the native player;
- `EXT-X-DISCONTINUITY` is supported only for PTS discontinuity, not a codec,
  container, or PID change;
- `EXT-X-DISCONTINUITY-SEQUENCE` is not supported;
- media sequence numbers must match across resolutions on webOS 6-era TVs;
- `EXT-X-MEDIA` video type is not supported.

Therefore manifest rewriting cannot assume that an ad marker understood by a
desktop player is understood by the C1. Removing or joining periods across
codec/container/timestamp boundaries could make playback fail. Preserve the
original stream unless structural ad evidence is unambiguous and the transformed
manifest passes real-device seek/adaptation/long-run tests.

LG's [webOS 6 audio/video format table](https://webostv.developer.lge.com/develop/specifications/video-audio-60)
lists H.264/AVC, HEVC, VP9, and AV1 capability on Ultra HD models, with AAC and
other common audio formats. Codec presence in the TV specification is only an
upper bound: the playback spike must still record the container, profile,
level, bitrate, audio codec, and actual RUTUBE manifest served to the C1.

The simplest supported player surface is an HTML5 `<video>` element. Use native
HLS first; introduce MSE/player libraries only if the observed RUTUBE source or
quality-control requirements demand them. This reduces memory and compatibility
risk on Chromium 79.

### Lifecycle and OLED screensaver behavior

LG's [App Lifecycle](https://webostv.developer.lge.com/develop/getting-started/app-lifecycle)
defines foreground, suspended, and not-launched states. Leaving the app causes
a `visibilitychange` to hidden; returning can cause `visibilitychange` visible
or relaunch events. Player sessions, network work, timers, and event listeners
must be paused or released on suspension and rebuilt idempotently on resume.
The app must not assume that background JavaScript continues normally.

LG's [Screensaver guide](https://webostv.developer.lge.com/develop/guides/screensaver)
states that normal full-screen video suppresses the screensaver. OLED models
have short idle timeouts, and LG supplies Type 2/3 policies for special OSD or
mostly-static experiences. For this app, use platform full-screen video behavior
during playback and normal idle behavior elsewhere. Do not globally inhibit the
screensaver. If persistent controls/OSD require Type 2, validate it specifically
on the C1 and keep it scoped to the documented application metadata behavior.

## Architecture comparison

| Criterion | Thin hosted wrapper/patch | Packaged custom frontend |
| --- | --- | --- |
| Proven C1/webOS delivery model | Strong: official RUTUBE app uses it | Strong platform support, but RUTUBE flow still needs a spike |
| Authentication/cookies | Best fit because the top-level app is HTTPS-hosted | Packaged `file` origin has no cookie support; device auth needs explicit design |
| Remote UI | Official TV UI already exists | Must implement and test focus, Back, keyboard, and pointer interaction |
| Playback compatibility | Official frontend owns player integration | Must prove native HLS/DRM/source behavior on the C1 |
| Ad-control feasibility | Unknown and fragile until injection and ad delivery are proven | Highest control once source/ad structures are known |
| Coupling | High coupling to remotely changed DOM/JS/responses | Coupling confined to explicit API adapters and fixtures |
| Observability | Harder inside unowned minified frontend | Full control of safe diagnostics and player state |
| Update risk | Server changes can break a patch instantly | API changes can break adapters, but contracts are testable |
| Licensing | Official assets/code are not licensed for reuse | Our implementation can be clean-room/open-source |
| Offline shell/recovery UI | Network-dependent remote application | Local loading/error/retry screens remain available |

## Recommendation and decision gates

Choose a **packaged custom frontend** as the intended architecture, with these
conditions and rollback rules:

1. Keep all undocumented RUTUBE access behind adapters with dated, sanitized
   contract fixtures.
2. Before catalog UI work, prove one public VOD through source resolution and
   native `<video>` playback on the real LG C1, including pause, seek, Back,
   suspend/resume, and a 30-minute run.
3. Verify whether authentication, DRM, or CORS prevents the required public MVP
   flow. Do not add a credential proxy or root service by assumption.
4. If public source retrieval cannot be made reliable but the official hosted
   frontend plays reliably, run a bounded wrapper-patch spike. It must prove
   deterministic script injection for this app ID, remote navigation, safe
   lifecycle cleanup, and structural (not timing/domain-guess) ad handling.
5. Reject the wrapper patch if it depends on unstable DOM selectors, copying
   proprietary RUTUBE assets, undocumented privileged package fields, or
   masquerading as the official application ID.
6. Consider a native/service-heavy design only after both native HTML5 playback
   and the hosted-wrapper spike fail for a documented platform reason.

This recommendation is intentionally narrower than a final ADR. Endpoint,
playback, DRM, and advertising research can still falsify the custom-client
assumption. What the current evidence does establish is that a redirect-only
wrapper already exists officially and offers no meaningful path to the project's
control and observability goals.

## Immediate follow-up evidence needed

- Record the target TV's full model suffix, firmware, reported webOS/SDK
  version, and region with `ares-device --system-info` plus the TV settings.
- Install/launch the official application or its current public IPK on the C1
  only if legally and operationally appropriate; record baseline navigation,
  login, playback, and lifecycle behavior without credentials in logs.
- Complete the separate RUTUBE endpoint/source and advertising-mechanism report.
- Test direct HLS playback against the exact manifests RUTUBE serves to the TV
  user agent; do not infer success from desktop playback or codec tables.
- Select and add a license for this repository before accepting copied code or
  publishing releases as an open-source project.
