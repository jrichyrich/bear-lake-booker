# Chunk Audit: Monitoring, Notifications & Ops Utilities

**User-facing feature**: Continuous monitor, wrapper flow, notifications, inspection tooling
**Risk Level**: Medium
**Files Audited**: `src/index.ts`, `src/notify.ts`, `src/inspect.ts`, `src/flow.ts`, `src/timer-utils.ts`, `src/config.ts`, `src/theme.ts`, `src/serial-task-queue.ts`, `src/test-notify.ts`, `scripts/find_open_date.ts`, `scripts/test_session.ts`
**Status**: Complete

## Purpose (as understood from reading the code)
This chunk provides the surrounding operator tools: the low-overhead monitor, timing helpers, end-to-end wrapper, notifications, and network inspection utilities.

## Runtime Probe Results
- **Tests found**: Yes
- **Tests run**: 11 passed, 0 failed (`notify`)
- **Import/load check**: Covered indirectly by Jest and `npx tsc --noEmit`
- **Type check**: OK
- **Edge case probes**: `assertBookingWindow('07/11/2026')` passed under a mocked `2026-03-11 07:59` clock while `isDateBookableNow('07/11/2026', now)` returned `false`
- **Key observation**: The timing helpers disagree about the booking-window boundary; one respects the 8:00 AM threshold and one ignores it.

## Dimension Assessments

### Implemented
The monitoring and notification tools are implemented and usable. `flow.ts` correctly bridges `race.ts` and `view-cart.ts`, and `inspect.ts` is a practical debugging helper.

### Correct
`src/timer-utils.ts:50-68` enforces only a date-based “four months from today” check, not the documented “four months prior at 8:00 AM” rule. That means callers can believe a date is bookable before the opening minute.

### Efficient
`src/timer-utils.ts:25-41` uses a busy-spin for the final 200ms. That is small but unnecessary CPU pressure during the most timing-sensitive moment.

### Robust
The monitor’s expired-session branch is misleading: `src/index.ts:42-45` calls `performAutoLogin([])`, which does not renew any accounts.

### Architecture
These utilities are cohesive enough, but `package.json` still advertises a broken default test command and the chunk is heavily macOS-biased by design (`osascript`, Keychain, Messages).

## Findings

### 🔴 Critical
- None.

### 🟡 Warning
- **[src/timer-utils.ts:50]** — `assertBookingWindow` ignores the documented 8:00 AM opening time — It can green-light dates that are still closed at the release boundary.
- **[src/index.ts:45]** — Default-session auto-login in monitoring mode is a no-op — The expired-session warning path does not actually renew the default account.
- **[package.json:21]** — `npm test` is broken even though Jest tests exist — This hides the real test surface behind a failing default command.

### 🟢 Note
- Notification helpers are well tested relative to their complexity.
