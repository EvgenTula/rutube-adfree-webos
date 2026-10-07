# RUTUBE AdFree for LG webOS

An experimental anonymous RUTUBE client for LG C1/webOS. The packaged custom
frontend provides a TV-distance catalog, search, video details, and native HLS
playback without loading the official embedded player or its separate VAST
orchestration path.

The name is a project goal, not a guarantee: sampled public sources were direct
content HLS, but advertising behavior can vary by content, account, region, and
time. The application does not rewrite manifests or bypass payment, DRM,
authentication, or access controls.

## Current status

- The anonymous MVP is composed end to end through isolated catalog, playback
  source, native media, navigation, and application-flow modules.
- Home pagination, search, details, fullscreen playback, play/pause, seeking,
  Back precedence, replay, retry, cancellation, and consecutive sessions have
  automated local coverage.
- Native HLS automatic adaptation is shown honestly as `auto`; manual quality
  selection is not offered because the current native-player seam cannot prove
  a reliable manual switch.
- Dated sanitized fixtures cover catalog, VOD, live, unavailable, paid, DRM,
  malformed, marker, and encryption response shapes.
- Installation, playback, remote behavior, CORS, codecs, screensaver behavior,
  and long-run stability on an actual LG C1 are **not yet verified**.

See [MVP architecture and behavior](docs/mvp.md),
[development and device instructions](docs/development.md), the
[device-profile template](docs/device-profile.md), and the full
[implementation plan](docs/implementation-plan.md).

## Local verification

```sh
npm test
npm run check
```

No runtime packages or `npm install` step are required.

## Desktop preview

```sh
npm run dev
```

Open `http://127.0.0.1:4173`. The development server exposes a same-origin
proxy for only the four anonymous RUTUBE JSON GET routes required by the MVP.
It rejects credentials and is not copied into `dist` or an IPK. Production
packages request RUTUBE directly; desktop preview does not prove packaged-app
CORS or TV playback.

Generated `dist/`, `artifacts/`, and `.ipk` files are intentionally not
committed.
