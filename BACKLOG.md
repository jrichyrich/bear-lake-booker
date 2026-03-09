# Bear Lake Booker Backlog

## North Star
- Win the 8:00 AM Bear Lake 4-month release race.
- Secure up to 6 valid holds across 2 accounts before competitors do.
- Hand off to manual checkout when CAPTCHA or payment requires a human.
- See [`docs/NORTH_STAR.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/NORTH_STAR.md).

## Current State
- `src/index.ts` provides low-overhead HTTP monitoring for a specific arrival date and can fall back to auto-login when the default session expires.
- `src/race.ts` supports hybrid and scheduled capture, persistent Playwright profiles, targeted site lists, structured run summaries, and both `bookingMode=single` and `bookingMode=multi`.
- Authentication and session handling now live under `.sessions/` with per-account session files managed by `src/auth.ts`, `src/session-manager.ts`, and `src/session-utils.ts`.
- Multi-account booking orchestration has been split into dedicated helpers such as `src/account-booker.ts`, `src/account-booker-runtime.ts`, `src/booking-policy.ts`, and `src/site-targeting.ts`.
- The current safety boundary remains unchanged: automation stops at cart hold / `Order Details`, and payment is still manual.

## Active Backlog
### Phase 1: Release Readiness
- [ ] Validate the full 8:00 AM release-day runbook with both accounts.
  This includes session prep, launch timing, CAPTCHA handoff, and cart opening after a hold.
- [ ] Harden and document live `bookingMode=multi` behavior.
  Current support exists, but the live operating envelope still needs validation around hold caps, duplicate-site prevention, cross-account routing, and cart contention.
- [ ] Document recommended release-day commands for:
  single account dry run, single account live hold, two-account single mode, and two-account multi mode.
- [ ] Align remaining design docs with the current `.sessions/` model, `bookingMode`, and the operator runbook.

### Phase 2: Release-Window Execution
- [ ] Add or refine pre-8:00 scout discovery so target sites are known before launch.
- [ ] Improve agent allocation across 2 accounts so up to 6 holds can be pursued without duplicate effort.
- [ ] Tighten launch timing and warm-up behavior around the 8:00 AM release event.
- [ ] Improve target-site allowlisting and prioritization for the release window.

### Phase 3: Operational Hardening
- [ ] Add cross-platform push notifications (`ntfy.sh`, Pushover, or Twilio) for hold secured and manual action required events.
- [ ] Expand session refresh from today’s reactive/manual flow into proactive background renewal for all configured accounts.
  The repo already has session validation and auto-login primitives, but not a full autonomous refresh loop.
- [ ] Speed up post-hold manual handoff with more direct cart-opening and clearer operator prompts.

### Later / Optional
- [ ] Implement date-range scanning (`--dateRange`) for cancellation hunting and broader monitor flows.
  See [`docs/ARCHITECTURE_ROADMAP.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/ARCHITECTURE_ROADMAP.md).
- [ ] Add a watchdog daemon that monitors continuously and triggers `race.ts` internally on a hit.
  This matters more for cancellation capture than for the 8:00 AM release race.
- [ ] Revisit broader autonomous monitoring after the release-window flow is proven.

## Completed Milestones
- [x] Direct HTTP availability monitoring for exact-date searches.
- [x] Unified Playwright race flow with persistent profiles, per-agent logs, screenshots, and run summaries.
- [x] Parser test coverage plus focused unit tests for session, booking-policy, site-targeting, and serial task queue helpers.
- [x] Extracted race support logic into dedicated helpers such as `src/automation.ts`, `src/account-booker.ts`, and `src/session-manager.ts`.
- [x] Multi-account session file handling via `.sessions/session-*.json`.
- [x] Site targeting, checkout auth handling, and cart-view support for post-capture manual completion.
- [x] README and Phase 1 operator runbook updated for the current workflow.
- [x] North-star mission documented for the 8:00 AM Bear Lake release race.

## Reference Docs
- [`README.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/README.md)
- [`docs/NORTH_STAR.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/NORTH_STAR.md)
- [`docs/PHASE1_RUNBOOK.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/PHASE1_RUNBOOK.md)
- [`docs/PHASE1_RESULTS.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/PHASE1_RESULTS.md)
- [`docs/ARCHITECTURE_ROADMAP.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/ARCHITECTURE_ROADMAP.md)
- [`docs/MULTI_HOLD_MODE.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/MULTI_HOLD_MODE.md)
- [`docs/MULTI_AGENT_PLAN.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/MULTI_AGENT_PLAN.md)
- [`docs/MULTI_AGENT_TESTS.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/MULTI_AGENT_TESTS.md)
