# Bear Lake Booker - Backlog

## Current Status
- `src/index.ts` uses direct HTTP monitoring for exact-date availability.
- `src/race.ts` can open site details and stop safely at `Order Details`.
- `src/auth.ts` creates `session.json` for logged-in Playwright runs.
- `src/inspect.ts` captures ReserveAmerica network traffic for flow analysis.
- `src/agent-race.ts` has been removed in favor of the unified Playwright race path.

## Priority Next Work
### Phase 1: Parallel Agent Foundation
- [ ] Add persistent Playwright profile support to `src/race.ts`.
- [ ] Add `profiles/` to `.gitignore`.
- [ ] Add per-agent logs and screenshots.
- [ ] Verify `c=2` and `c=4` before attempting `c=10`.

### Phase 2: Reliability
- [ ] Move shared constants into `src/config.ts`.
- [ ] Move notification logic into a shared utility.
- [ ] Add a reset flow for stale persistent profiles.
- [ ] Add file-based run summaries for successful and failed captures.

### Phase 3: Product Shape
- [ ] Add a small README derived from `GEMINI.md`.
- [ ] Decide whether `Order Details` is the permanent automation boundary or just an interim stop.
- [ ] Add optional non-macOS notifications.

## Reference Docs
- [`MULTI_AGENT_PLAN.md`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/MULTI_AGENT_PLAN.md)
- [`MULTI_AGENT_TESTS.md`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/MULTI_AGENT_TESTS.md)
- [`GEMINI.md`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/GEMINI.md)

## Completed Tasks
- [x] Initial `.gitignore` setup.
- [x] Direct HTTP availability monitoring.
- [x] Shared ReserveAmerica search helper.
- [x] Logged-in session capture via `auth.ts`.
- [x] Race flow that reaches site details safely.
- [x] Safe stop at `Order Details`.
- [x] Network inspection tooling for request capture.
- [x] Results-row action parsing fix for multi-agent dry runs.
- [x] Single-winner cancellation for `c=2 --book`.
