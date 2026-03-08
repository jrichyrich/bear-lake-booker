# Bear Lake Booker - Backlog

## Current Status
- `src/index.ts` uses direct HTTP monitoring for exact-date availability.
- `src/race.ts` can open site details and stop safely at `Order Details`.
- `src/auth.ts` creates `session.json` for logged-in Playwright runs.
- `src/inspect.ts` captures ReserveAmerica network traffic for flow analysis.
- `src/agent-race.ts` has been removed in favor of the unified Playwright race path.

## Priority Next Work
### Phase 1: Parallel Agent Foundation
- [x] Add persistent Playwright profile support to `src/race.ts`.
- [x] Add `profiles/` to `.gitignore`.
- [x] Add per-agent logs and screenshots.
- [x] Verify `c=2` and `c=4` before attempting `c=10`.

### Phase 2: Reliability
- [x] Move shared constants into `src/config.ts`.
- [x] Move notification logic into a shared utility.
- [x] Add a reset flow for stale persistent profiles.
- [x] Add file-based run summaries for successful and failed captures.

### Phase 3: Product Shape
- [x] Add a small README derived from `GEMINI.md`.
- [x] Decide whether `Order Details` is the permanent automation boundary or just an interim stop.
- [ ] Decide whether to implement explicit `bookingMode=multi` after persistent profiles land.
- [x] Add optional non-macOS notifications.
- [ ] **Multi-Session Support**: Update `multi-hold` mode to support loading an array of distinct `session.json` profiles (e.g. `session-p1.json`, `session-p2.json`) and assigning them to different agents to bypass the single-account cart limit for concurrent holds.

### Phase 5: Autonomous Pipeline
- [ ] Implement Date Range Scanning (`--dateRange`)
- [ ] Push Notifications (Twilio / ntfy.sh)
- [ ] Watchdog Daemon (24/7 background monitor -> race trigger)
- [ ] Headless Auto-Session Refresh
*(See `ARCHITECTURE_ROADMAP.md` for full breakdown and testing plans)*

## Reference Docs
- [`ARCHITECTURE_ROADMAP.md`](/Users/lisarichards/Documents/GitHub/bear-lake-booker/ARCHITECTURE_ROADMAP.md)
- [`MULTI_AGENT_PLAN.md`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/MULTI_AGENT_PLAN.md)
- [`MULTI_AGENT_TESTS.md`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/MULTI_AGENT_TESTS.md)
- [`MULTI_HOLD_MODE.md`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/MULTI_HOLD_MODE.md)
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
