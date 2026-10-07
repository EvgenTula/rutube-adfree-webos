# LG C1 device profile and Phase 0 test record

Copy this file to a dated record before filling it in, for example
`docs/test-results/2026-10-07-lg-c1-phase0.md`. Do not record IP addresses,
account names, passphrases, private keys, device codes, cookies, or tokens.

## Device

| Field | Value |
| --- | --- |
| Test date and timezone | TODO |
| Tester | TODO |
| Full LG model suffix | TODO |
| Firmware version | TODO |
| webOS version | TODO |
| Region | TODO |
| Developer Mode available | TODO: yes/no and any limitation |
| Homebrew available | TODO: yes/no/not evaluated |
| Chosen Phase 0 install path | TODO: Developer Mode/Homebrew |

Use TV settings or the physical product label for the complete model suffix and
region. Capture the non-sensitive output of this command for firmware/SDK
cross-checking:

```sh
ares-device --system-info --device myTV
```

## Build

| Field | Value |
| --- | --- |
| Git commit | TODO |
| Application version | TODO: copy from `src/appinfo.json` |
| Package filename | TODO |
| webOS CLI version (`ares -V`) | TODO |
| Package command | `npm run package:webos:debug` |

## Phase 0 evidence

| Check | Expected | Actual | Result |
| --- | --- | --- | --- |
| Clean install | `ares-install` reports success | TODO | PENDING |
| Launch | Baseline screen becomes visible | TODO | PENDING |
| Layout | Text and status card fit at 1920x1080 | TODO | PENDING |
| Version | Screen matches `src/appinfo.json` | TODO | PENDING |
| Back | App closes without an error | TODO | PENDING |
| Normal diagnostics | `app.ready` JSON event, no secrets/PII | TODO | PENDING |
| Debug diagnostics | More verbose mode retains redaction | TODO | PENDING |
| Relaunch | App opens again after being closed | TODO | PENDING |

## Sanitized notes

TODO: record observations and references to reviewed, sanitized logs. Do not
paste credentials or unique personal/device identifiers.
