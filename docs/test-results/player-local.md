# Player local behavior test result

- **Date:** 2026-10-07
- **Environment:** Windows, local Node.js with in-memory media adapter
- **Scope:** Player state machine and native-adapter boundary
- **Device:** not used
- **LG C1 result:** `PENDING`

Commands executed:

```text
npm.cmd run test:player
npm.cmd test
npm.cmd run check
```

Result: 19 Player tests passed, 0 failed. The checks cover startup and timeout,
autoplay rejection, immutable URL-free snapshots, VOD/DVR/live seek rules,
buffering and terminal transitions, source replacement, automatic-quality
baseline, explicit manual-quality rejection, visibility pause/resume, native
adapter containment, and idempotent cleanup.

The combined suite passed 53 tests with 0 failures. Syntax checking, application
build, and packaged-resource validation also passed; the test-only fake adapter
was absent from `dist`.

This evidence is local only. It does not establish that RUTUBE HLS starts on an
LG C1, that the packaged origin can access the media source, or that webOS
lifecycle and screensaver behavior match the simulated visibility events.
