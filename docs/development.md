# Phase 0 development and LG C1 deployment

This guide covers the anonymous packaged MVP. Commands are run from the
repository root. Local results do not claim LG C1 playback support.

## Prerequisites

- Node.js 18 or newer and npm for local checks and deterministic asset
  generation. The current project has no third-party runtime dependencies.
- LG's webOS CLI for `.ipk` packaging and device commands:

  ```sh
  npm install --global @webos-tools/cli
  ares -V
  ```

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

After installing the webOS CLI:

```sh
npm run package:webos
```

For an inspectable, non-minified development package:

```sh
npm run package:webos:debug
```

The output is written under `artifacts/` and is not committed. `ares-package`
prints the generated filename, which contains the ID and version from
`src/appinfo.json`.

## Connect an LG C1 with Developer Mode

1. Install and open **Developer Mode** on the TV, sign in, enable Dev Mode, and
   let the TV reboot.
2. Add the TV using `ares-setup-device`. Use port `9922` and user `prisoner`.
   The examples below assume the device name `myTV`.
3. Enable **Key Server** in the TV's Developer Mode app, then retrieve the key:

   ```sh
   ares-novacom --device myTV --getkey
   ```

4. Enter the passphrase shown by the TV and verify the connection:

   ```sh
   ares-device --system-info --device myTV
   ```

Do not put the TV passphrase, private key, account credentials, device codes,
cookies, or tokens in this repository or in collected logs.

## Install, launch, and close

Build the package, then run:

```sh
ares-install --device myTV artifacts/PACKAGE_FILE.ipk
ares-launch --device myTV io.github.evgentula.app.rutubeadfree
ares-launch --device myTV --close io.github.evgentula.app.rutubeadfree
```

Expected launch result: the Home catalog appears, remote focus is visibly
outlined, Search opens a normal text input, Details can start native fullscreen
HLS, and two Back presses first hide player controls and then return to Details.
This expectation remains unverified on the LG C1 until a dated result is
recorded.

## Collect sanitized diagnostics

Package with `package:webos:debug`, install and launch it, then open the Web
Inspector:

```sh
ares-inspect --device myTV --app io.github.evgentula.app.rutubeadfree --open
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

## Current known gap

At the time of the Phase 0 baseline implementation, LG's `ares` commands were
not installed in the development environment, and no LG C1 was connected.
Consequently `.ipk` creation, installation, launch, Back behavior, rendering,
and log collection on the television remain pending.
