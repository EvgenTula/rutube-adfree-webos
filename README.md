# RUTUBE AdFree for LG webOS

An early-stage open-source RUTUBE client experiment for LG C1/webOS. The
repository currently contains only the Phase 0 platform baseline: a minimal
packaged web app, safe structured diagnostics, local validation, and device
deployment instructions. RUTUBE catalog and playback behavior have not been
implemented or selected yet.

## Current status

- Local JavaScript checks, build validation, and unit tests are automated.
- The generated app has valid metadata and required PNG resources.
- Packaging requires the external LG webOS CLI.
- Installation and launch on a real LG C1 are **pending device evidence**.

See [development and device instructions](docs/development.md), the
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
