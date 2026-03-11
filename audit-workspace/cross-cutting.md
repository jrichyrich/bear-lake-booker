# Cross-Cutting Scan

## Orientation
Bear Lake Booker is a TypeScript CLI that watches Bear Lake State Park inventory and then switches into Playwright-driven cart-hold automation. The codebase is moderately sized: roughly 7.6k lines of source TS plus 1.6k lines of Jest tests, with the heaviest modules concentrated in `src/race.ts`, `src/automation.ts`, and `src/site-calendar.ts`. The repo is operationally focused rather than library-oriented: most value sits in a few large CLI entry points and browser flows, not in a broad API surface.

## Command Results
- `npx tsc --noEmit`: passed with no TypeScript errors.
- `npx jest --runInBand`: 16/16 suites passed, 92/92 tests passed.
- Availability/reporting chunk tests: 6 suites passed, 33 tests passed.
- Race coordination chunk tests: 4 suites passed, 20 tests passed.
- Browser/cart helper tests: 2 suites passed, 13 tests passed.
- Auth/session helper tests: 1 suite passed, 1 test passed.
- Release/projection helper tests: 2 suites passed, 14 tests passed.
- Notifications tests: 1 suite passed, 11 tests passed.
- `npm audit` and `npm audit --omit=dev`: found 0 vulnerabilities.
- `rg` scans for `TODO|FIXME|HACK|STUB|NotImplemented`: no matches in `src/`, `scripts/`, or `tests/`.
- Secret-pattern scan across tracked source/config: no matches.
- Source lines: `7597`
- Test lines: `1603`

## Findings

### Warning
- **[package.json:21]** — `npm test` is wired to a stub that exits 1 even though Jest suites exist and pass under `npx jest --runInBand`. This breaks the default Node workflow and will produce false-negative CI results if a pipeline uses the conventional test script.
- **[src/race.ts:110-117]** — Numeric CLI options (`--concurrency`, `--monitorInterval`, `--maxHolds`) are parsed with `parseInt` and then trusted without validation. Invalid input can become `NaN`, which will distort scheduling and hold-cap logic rather than fail fast.
- **[src/timer-utils.ts:25-41]** — `waitForTargetTime` busy-spins for the final 200ms. For a single process this is tolerable, but on multi-agent runs it burns CPU right at the launch boundary and makes timing behavior harder to reason about under load.
- **[src/race.ts] / [src/release.ts] / [src/automation.ts]** — The most important browser-orchestration modules have no direct unit or integration coverage. The passing Jest suite mainly covers helpers and parsers, so the riskiest live paths still rely on manual validation.

## Dead Code
- No obvious dead files or stubbed implementations were found in tracked source.

## Interface Integrity
- The typed helper surface is generally coherent. Most issues come from business assumptions leaking across chunks: hard-coded site-code formats, hard-coded park URLs, and release-window timing assumptions.
