# Phase 0 development and LG C1 deployment

This guide covers the anonymous packaged MVP. Commands are run from the
repository root. Local results do not claim LG C1 playback support.

## Prerequisites

- Node.js 20, 22, or 24 and npm. The application has no third-party runtime
  dependencies.
- Install the exact development tool versions recorded in `package-lock.json`:

  ```sh
  npm ci
  npm exec -- ares -V
  ```

  This installs `@webos-tools/cli` 3.2.6 locally. A global CLI is neither
  required nor used by the package scripts.

- For a physical TV: an LG Developer account, the Developer Mode app installed
  from LG Apps, and the development PC and TV on the same network.

The CLI commands and metadata follow LG's official
[CLI guide](https://webostv.developer.lge.com/develop/tools/cli-dev-guide),
[appinfo.json reference](https://webostv.developer.lge.com/develop/references/appinfo-json),
and [Developer Mode guide](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app).

## Local validation and tests

Run the diagnostics, HTTP, catalog, playback-source, and manifest tests:

```sh
npm test
```

Run JavaScript syntax checks, rebuild `dist/`, and validate metadata plus icon
dimensions:

```sh
npm run check
```

This also rejects known shipped JavaScript/CSS features newer than the LG C1's
webOS 6 Chromium 79 engine. It is a conservative source check, not a substitute
for the real-TV run.

The build has no downloaded inputs. `scripts/build.js` copies the app sources
and deterministically generates the required 80x80 icon, 130x130 large icon,
and 1920x1080 splash PNG files. `dist/` is disposable and ignored by Git.

Run only the contract foundation tests with:

```sh
npm run test:contracts
```

Run only Navigation and AppFlow integration tests with:

```sh
npm run test:mvp
```

## Desktop preview

Run the dependency-free preview server with:

```sh
npm run dev
```

Then open `http://127.0.0.1:4173`. On localhost only, the app routes its four
required anonymous JSON endpoint families through `/rutube/` on the preview
server. The development proxy accepts GET only, validates an exact route
allowlist, rejects Cookie and Authorization headers, follows no redirects, and
forwards no credentials. It is a development convenience for browser CORS and
is not copied to `dist` or the IPK. HLS/CDN requests remain direct.

Never expose this server on a public interface. Preview success does not prove
packaged `file`-origin CORS, native HLS, codec support, or TV behavior.

## Create an IPK

After `npm ci`:

```sh
npm run package:webos
```

For an inspectable, non-minified development package:

```sh
npm run package:webos:debug
```

The output is written under `artifacts/` and is not committed. `ares-package`
prints the generated filename, which contains the ID and version from
`src/appinfo.json`. The script then writes
`PACKAGE_FILE.ipk.provenance.json` with the application ID/version, full source
commit, clean/dirty flag, Node and CLI versions, byte size, and SHA-256 digest.
Keep the IPK and sidecar together when transferring a candidate. A release
candidate must have `sourceDirty: false` and a `buildInfo.commit` matching the
source commit prefix.

## Connect an LG C1 with Developer Mode

1. Install and open **Developer Mode** on the TV, sign in, enable Dev Mode, and
   let the TV reboot.
2. Add the TV using `npm exec -- ares-setup-device`. Use port `9922` and user `prisoner`.
   The examples below assume the device name `myTV`.
3. Enable **Key Server** in the TV's Developer Mode app, then retrieve the key:

   ```sh
   npm exec -- ares-novacom --device myTV --getkey
   ```

4. Enter the passphrase shown by the TV and verify the connection:

   ```sh
   npm exec -- ares-device --system-info --device myTV
   ```

Do not put the TV passphrase, private key, account credentials, device codes,
cookies, or tokens in this repository or in collected logs.

## Clean install, launch, and close

Build the package, then run:

```sh
npm exec -- ares-install --device myTV artifacts/PACKAGE_FILE.ipk
npm exec -- ares-install --device myTV --list
npm exec -- ares-launch --device myTV io.github.evgentula.app.rutubeadfree
npm exec -- ares-launch --device myTV --close io.github.evgentula.app.rutubeadfree
```

Expected launch result: the Home catalog appears, remote focus is visibly
outlined, Search opens a normal text input, Details can start native fullscreen
HLS, and two Back presses first hide player controls and then return to Details.
This expectation remains unverified on the LG C1 until a dated result is
recorded.

## Update and uninstall

For an update, increment the three-part `version` in `src/appinfo.json`, build a
new clean package, close the running app, and install the new IPK over the same
application ID:

```sh
npm run package:webos
npm exec -- ares-launch --device myTV --close io.github.evgentula.app.rutubeadfree
npm exec -- ares-install --device myTV artifacts/NEW_PACKAGE_FILE.ipk
npm exec -- ares-launch --device myTV io.github.evgentula.app.rutubeadfree
```

Verify the new version/commit in the Inspector diagnostics. If an in-place
update behaves unexpectedly, capture sanitized evidence, uninstall, and repeat
the clean-install procedure rather than treating the clean install as an update
pass.

To uninstall and verify removal:

```sh
npm exec -- ares-launch --device myTV --close io.github.evgentula.app.rutubeadfree
npm exec -- ares-install --device myTV --remove io.github.evgentula.app.rutubeadfree
npm exec -- ares-install --device myTV --list
```

Uninstalling removes application-local settings, including the debug flag.

## Collect sanitized diagnostics

Package with `package:webos:debug`, install and launch it, then open the Web
Inspector:

```sh
npm exec -- ares-inspect --device myTV --app io.github.evgentula.app.rutubeadfree --open
```

The browser Console contains one-line JSON events. Debug mode changes verbosity
only; the same credential and personal-data redaction applies to every level.

To enable debug verbosity from the Inspector Console, run the following and
relaunch the app:

```js
localStorage.setItem("rutube-adfree.debug", "true");
```

Disable it with:

```js
localStorage.removeItem("rutube-adfree.debug");
```

For hosted or desktop preview only, `?debug=1` also enables it. Before attaching
a log to an issue, inspect it again for credentials and personal data. Never
paste secrets into diagnostic fields to test redaction.

## Record the device result

Copy `docs/device-profile.md` to a dated test record, fill all fields, and add
the exact build commit and observed result. A local build, Simulator result, or
successful `.ipk` creation is not a real-device pass.

## Troubleshooting

- **`npm` is blocked by PowerShell execution policy:** invoke `npm.cmd` instead
  of `npm` in PowerShell. Do not weaken the machine-wide policy for this project.
- **No matching device / SSH failure:** confirm Developer Mode is still enabled,
  the PC and TV share a reachable network, port `9922` and user `prisoner` are
  configured, then enable Key Server and run `npm exec -- ares-novacom --device
  myTV --getkey` again. Developer Mode access expires and may require renewal.
- **Package will not replace the installed build:** increment
  `src/appinfo.json`'s version, rebuild, and retry. If necessary, capture the
  error, uninstall explicitly, then perform a clean install.
- **Catalog/search reports a network error:** first retry after connectivity
  returns. `opaque-network` intentionally covers indistinguishable CORS,
  DNS/TLS, and routing rejection. Use the Inspector Network panel to determine
  which request failed; do not log signed URLs or headers.
- **Catalog works but playback fails:** record the typed media error, manifest
  type, codec summary, TV firmware/webOS version, and a non-sensitive content
  ID. Packaged-origin media access and codec support must be decided by the TV,
  not by desktop preview.
- **Search keyboard does not appear or focus is trapped:** record whether pointer
  or D-pad was last used and the exact Back/arrow sequence. Back should dismiss
  text entry before navigating away.
- **Screensaver appears during playback or remains suppressed afterward:** stop
  playback immediately, verify the media element was unloaded, and record the
  lifecycle sequence. The app installs no global keep-awake policy.
- **Inspector cannot attach:** launch the debug package first and retry
  `ares-inspect`. Reacquire the Developer Mode key if the session expired.

## Current device gap

The pinned LG CLI packages this project locally, but no LG C1 is connected in
the development environment. Installation, launch, update/uninstall behavior,
Back/remote behavior, rendering, CORS, playback, lifecycle, screensaver, memory,
and log inspection on the television remain pending.
