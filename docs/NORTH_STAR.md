# North Star

## Mission
At 8:00 AM on the first day Bear Lake opens a stay 4 months in advance, secure as many valid campsite holds as possible, up to 6 total, across 2 user accounts before competitors do, then hand off to manual checkout.

## Primary Objective
Win the release-window race for Bear Lake inventory.

This codebase exists to:
- identify which Bear Lake campsites are actually available at the 8:00 AM release moment
- launch fast enough to beat competing users
- spread holds across 2 authenticated accounts
- avoid wasting attempts on duplicate or low-value targets
- stop at the cart / `Order Details` boundary so a human can solve CAPTCHA and finish checkout manually

## Success Metrics
- by 8:01 AM, one or more valid holds are secured in cart
- up to 6 total holds can be distributed across 2 accounts when inventory allows
- session state is ready before launch time
- agents do not waste attempts on the same site unless explicitly intended
- manual handoff after a hold is fast and obvious

## Constraints
- Bear Lake inventory opens at 8:00 AM, 4 months in advance
- CAPTCHA and checkout friction may be aggressive
- many users are competing for the same sites at the same time
- final payment must remain manual
- only 2 user accounts are available for distributed holds

## Operating Model
The intended release-day flow is:

1. Prepare and validate both account sessions before 8:00 AM.
2. Scout candidate sites and build the target list.
3. Launch at the exact release time with pre-warmed agents.
4. Hold as many valid sites as possible, up to the configured cap.
5. Open the correct carts immediately.
6. Complete checkout manually.

## Non-Goals
This project is not primarily trying to:
- automate final payment
- solve CAPTCHA automatically at all costs
- be a generic campground bot for every park and workflow
- optimize first for broad date-range cancellation hunting over the 8:00 AM release race

## Product Priorities
When tradeoffs appear, optimize in this order:

1. release-time speed and precision
2. multi-account hold coordination
3. target-site selection quality
4. reliable manual CAPTCHA handoff
5. observability and recovery
6. broader autonomous monitoring outside the release window

## Phase Framing
- Phase 1: release-readiness and operator reliability
- Phase 2: release-window execution tooling and multi-hold coordination
- Phase 3: operational hardening, notifications, session maintenance, and optional broader monitoring

## Decision Filter
Before adding a feature, ask:

1. Does this improve our odds at the 8:00 AM Bear Lake release window?
2. Does this help secure more valid holds across 2 accounts?
3. Does this reduce the chance of losing time to CAPTCHA, duplicate attempts, or operator confusion?

If the answer is no, it is probably not core work.
