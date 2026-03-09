# Phase 1 Operator Runbook

This runbook defines the Phase 1 operating baseline for Bear Lake Booker.

Phase 1 goal: prove the current system is understandable and safe to operate before adding `--dateRange`, a watchdog daemon, or more autonomous behavior.

## Scope
Phase 1 covers:
- current `.sessions/` session handling
- single-account and multi-account capture
- `bookingMode=single` and `bookingMode=multi`
- cart recovery and manual checkout handoff
- CAPTCHA-aware operating procedure

Phase 1 does not cover:
- autonomous long-running watchdog behavior
- proactive background session refresh
- cross-platform push notifications
- date-range scanning

## Operator Workflow
Use this flow for all live runs:

1. Ensure keychain credentials are configured if you want auto-fill support:
   `npm run setup-keychain`
2. Authenticate the required accounts:
   `npm run auth -- --user lisa@gmail.com,jason@gmail.com`
3. Confirm the expected session files exist under `.sessions/`.
4. Choose the capture mode:
   - dry run for flow validation
   - `--book` for a real cart hold attempt
5. If checkout login or CAPTCHA appears:
   - use `--headed`
   - use `--checkoutAuthMode manual`
   - solve the challenge in the browser
6. When a hold lands, open carts:
   `npm run view-cart -- --accounts lisa@gmail.com,jason@gmail.com`
7. Complete payment manually before the hold expires.

## Safe Defaults
Use these defaults unless there is a reason not to:

- start with `--dryRun --headed`
- use `--bookingMode single` for normal capture
- use low concurrency first: `-c 2` or `-c 4`
- use `--checkoutAuthMode manual` if CAPTCHA is likely
- keep `--maxHolds 2` or lower when evaluating multi-hold behavior

## Phase 1 Validation Matrix
These are the four scenarios that should be exercised and documented before Phase 1 is considered complete.

| Scenario | Command template | Expected result | Evidence to collect |
| --- | --- | --- | --- |
| 1. Single account, dry run | `npm run race -- -d MM/DD/YYYY -l 3 -o BIRCH -m 5 -c 2 --dryRun --headed` | Session validates, agent opens candidate site details, no hold is placed | console output, logs entry, screenshots if generated |
| 2. Single account, live `--book` | `npm run race -- -d MM/DD/YYYY -l 3 -o BIRCH -m 5 -c 2 --book --headed --checkoutAuthMode manual` | One account reaches cart hold / `Order Details`; manual intervention works if challenged | cart page, run summary JSON, any checkout debug HTML |
| 3. Multi-account, single mode | `npm run race -- -d MM/DD/YYYY -l 3 -o BIRCH -c 4 --book --accounts lisa@gmail.com,jason@gmail.com --bookingMode single --headed --checkoutAuthMode manual` | At most one winning hold per account path; session routing is correct | run summary JSON, opened carts, account-specific session usage |
| 4. Multi-account, multi mode | `npm run race -- -d MM/DD/YYYY -l 3 -o BIRCH -c 4 --book --accounts lisa@gmail.com,jason@gmail.com --bookingMode multi --maxHolds 2 --headed --checkoutAuthMode manual` | No duplicate-site holds, `maxHolds` enforced, carts reflect held sites predictably | run summary JSON, held site list, duplicate-prevention behavior |

## What To Verify In Each Scenario
- Correct session file is selected for each account.
- Expired sessions trigger the expected renewal or manual login path.
- `view-cart` opens the correct cart for the account that received the hold.
- CAPTCHA behavior is explicit:
  - auto mode stops cleanly
  - manual mode waits for operator action
- Logs and run summaries are sufficient to explain what happened.

## Failure Modes To Record
Document each of these if observed:
- checkout CAPTCHA in headless or auto mode
- duplicate agents converging on the same site
- unexpected cart collisions across accounts
- stale or mismatched `.sessions/session-*.json` files
- a hold landing in a different account than expected
- session renewal timing out or falling back to manual auth

## Recommended Evidence Pack
For each Phase 1 run, save:
- command used
- date/time of run
- account list used
- whether run was `dryRun` or `--book`
- whether `bookingMode` was `single` or `multi`
- `logs/run-*.json` output
- any `logs/debug-checkout-fail-*.html`
- screenshots if a CAPTCHA or failure occurs

Record the results in:
- [`docs/PHASE1_RESULTS.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/PHASE1_RESULTS.md)

## Exit Criteria
Phase 1 is complete when:
- README and operator docs match the current code
- the four validation scenarios have been run and recorded
- `bookingMode=multi` behavior is understood well enough to state safe operating limits
- session handling across `auth`, `race`, and `view-cart` is predictable
- manual CAPTCHA handoff is documented and repeatable

## After Phase 1
Only after this baseline is solid should work move to:
1. `--dateRange`
2. watchdog daemon
3. proactive session refresh
4. push notifications
