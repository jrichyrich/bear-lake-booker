# Chunk Audit: Release Wrapper & Projection

**User-facing feature**: Scheduled release runs, release-morning projection shortlist
**Risk Level**: High
**Files Audited**: `src/release.ts`, `src/release-utils.ts`, `src/projection-shortlists.ts`
**Status**: Complete

## Purpose (as understood from reading the code)
This chunk is supposed to turn a release-day plan into a timed `race.ts` invocation. It validates sessions/carts, freezes a target site set before launch, optionally generates a projection shortlist, and then spawns the race process with resolved site arguments.

## Runtime Probe Results
- **Tests found**: Yes
- **Tests run**: 14 passed, 0 failed (`projection-shortlists`, `release-utils`)
- **Import/load check**: Covered indirectly by Jest and `npx tsc --noEmit`
- **Type check**: OK
- **Edge case probes**: Static review only for the live scout path; it depends on ReserveAmerica responses.
- **Key observation**: The helper tests are green, but the default scout path in `release.ts` is logically incompatible with the project’s core release-window workflow.

## Dimension Assessments

### Implemented
Scheduling, projection output, and argument rewriting are all implemented and readable.

### Correct
`src/release.ts:199-218` selects launch targets only from `search.exactDateMatches` during the pre-launch scout. On the actual 8:00 AM release morning, that scout runs before the booking window opens, so the wrapper can throw `No exact-date ... sites were available during the scout` before launch.

### Efficient
The scheduling helpers are efficient. The main problem is the correctness of the release-day strategy, not its runtime cost.

### Robust
The projection path is materially better than the default scout path because it does not require exact-date availability before the window opens. The default path is brittle against the repo’s own mission.

### Architecture
This chunk is close to the repo’s north-star behavior, but the default branch and the projection branch are not aligned. The good path exists, yet the default path still embodies the wrong pre-launch assumption.

## Findings

### 🔴 Critical
- **[src/release.ts:199]** — Default site scouting requires exact-date availability before launch time — This can abort the release wrapper during the exact release-window workflow the project is built around.

### 🟡 Warning
- **[src/release.ts]** — The high-level release wrapper has no direct tests — The helper suites do not cover the real spawn/scout/session/cart path.

### 🟢 Note
- The projection shortlist logic is a better fit for the product intent than the default scout logic.
