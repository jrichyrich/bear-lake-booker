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
### Phase 2: Release-Window Execution
- [ ] Add or refine pre-8:00 scout discovery so target sites are known before launch.
- [ ] Tighten launch timing and warm-up behavior around the 8:00 AM release event.
- [ ] Improve target-site allowlisting and prioritization for the release window.
- [ ] Convert the proven six-hold coordination path into a repeatable release-window rehearsal with fresh scout output and empty-cart preflight.

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
- [x] Phase 2 six-hold live validation succeeded on 05/22/2026: `lisarichards1984@gmail.com` secured `BH03`, `BH11`, `BH13` and `jrichards1981@gmail.com` secured `BH09`, `BH12`, `BH22`, proving `bookingMode=multi --maxHolds 3` across both accounts.
- [x] Cart confirmation hardening: authenticated shopping-cart pages are no longer misclassified as checkout login, and cart-site extraction now records glued labels like `...HOOKUPBH03`.
- [x] Exploratory `maxHolds=3` probe reached 5 total holds on 06/09/2026, proving 3 holds on one account and 2 on the other before a late-stage cart failure on the sixth attempt.
- [x] Phase 1 release-readiness closeout: two-account `bookingMode=multi` validation on 05/22/2026 secured BH09 and BH11 across both accounts, opened both carts, and established documented operating limits.
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
