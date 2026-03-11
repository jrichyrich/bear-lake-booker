# Chunk Audit: Race Orchestration

**User-facing feature**: Hybrid race mode, multi-agent coordination, multi-hold booking
**Risk Level**: High
**Files Audited**: `src/race.ts`, `src/account-booker.ts`, `src/account-booker-runtime.ts`, `src/booking-policy.ts`, `src/site-targeting.ts`, `src/launch-strategy.ts`, `src/reporter.ts`, `src/flow-contract.ts`
**Status**: Complete

## Purpose (as understood from reading the code)
This chunk coordinates the live booking race. It validates accounts, allocates agents, orders candidate sites, serializes per-account booking attempts, records holds, and writes a structured run summary.

## Runtime Probe Results
- **Tests found**: Yes
- **Tests run**: 20 passed, 0 failed (`account-booker`, `booking-policy`, `serial-task-queue`, `site-targeting`)
- **Import/load check**: Covered indirectly by Jest and `npx tsc --noEmit`
- **Type check**: OK
- **Edge case probes**: No safe end-to-end probe was run; live capture paths have external side effects.
- **Key observation**: The coordination helpers are covered and look coherent, but the 1,000-line `src/race.ts` entry point itself is largely untested.

## Dimension Assessments

### Implemented
The coordination model is real, not scaffolding. `AccountBooker`, `AccountBookerRuntime`, skip tracking, and run-summary output are all wired into `race.ts`.

### Correct
The orchestration logic is mostly sound, but `src/race.ts:110-117` trusts `parseInt` results for critical knobs like concurrency and hold caps without validating that the values are finite positive numbers.

### Efficient
The per-account `SerialTaskQueue` is a sensible way to avoid conflicting cart attempts. There are no obvious high-impact inefficiencies in the coordination helpers themselves.

### Robust
The chunk has good summary/reporting behavior, but live correctness depends heavily on modules outside this chunk (`automation.ts`, session helpers, DOM shape). Failures are observable rather than silent, which is a positive.

### Architecture
`src/race.ts` is too large and carries most of the workflow branching itself. The helpers reduce some risk, but the entry point is still doing orchestration, policy, telemetry, and CLI parsing in one place.

## Findings

### 🔴 Critical
- None.

### 🟡 Warning
- **[src/race.ts:110]** — Numeric CLI options are parsed but not validated — Bad input can degrade behavior into `NaN`-driven scheduling/hold logic instead of failing fast.
- **[src/race.ts]** — The core race entry point has no direct tests — Helper coverage does not prove the live launch/auth/cart orchestration behaves correctly under real release conditions.

### 🟢 Note
- `src/account-booker.ts` and `src/site-targeting.ts` are among the stronger parts of the repo.
