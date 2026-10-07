# RUTUBE AdFree for LG webOS

An early-stage open-source RUTUBE client experiment for LG C1/webOS. The
repository contains the Phase 0 platform baseline plus the contract foundation
for a packaged custom frontend: normalized catalog/details access, fresh
playback-source resolution, safe HTTP failures, and read-only HLS inspection.
The modules are not wired to the UI or native player yet.

## Current status

- Local JavaScript checks, build validation, and unit tests are automated.
- Dated sanitized fixtures cover catalog, VOD, live, access, paid, DRM,
  malformed, marker, and encryption response shapes.
- Catalog and playback adapters return typed results and never expose raw
  continuation URLs or signed URLs in failures.
- The generated app has valid metadata and required PNG resources.
- Packaging requires the external LG webOS CLI.
- Installation and launch on a real LG C1 are **pending device evidence**.

See [development and device instructions](docs/development.md), the
[contract foundation](docs/contract-foundation.md),
[device-profile template](docs/device-profile.md), and the full
[implementation plan](docs/implementation-plan.md).

## Quick local verification

```sh
npm test
npm run check
```

No runtime packages or `npm install` step are required for the current
baseline. Generated `dist/`, `artifacts/`, and `.ipk` files are intentionally
not committed.
