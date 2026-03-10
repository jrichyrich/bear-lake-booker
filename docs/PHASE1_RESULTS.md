# Phase 1 Results

Use this file to record the live validation runs defined in [`docs/PHASE1_RUNBOOK.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/PHASE1_RUNBOOK.md).

## Purpose
This document is the evidence log for Phase 1.

Record each run so the team can answer:
- which scenarios were actually executed
- which account/session path was used
- whether CAPTCHA appeared
- whether a hold was secured
- whether carts opened correctly
- what needs to be fixed before the 8:00 AM release race

## Immediate Next Action
Phase 1 is closed as of 2026-03-10. The final closeout run exercised real two-account multi-hold behavior against a known-bookable BIRCH target, reached two distinct cart holds, and confirmed the operator handoff path.

Use this sequence for the next release rehearsal:

1. Keep both account sessions fresh:
   `npm run auth -- --user lisarichards1984,jrichards1981`
2. Scout a known-bookable release-window target and narrow it with `--sites`.
3. Re-run Scenario 4 in headed/manual mode before changing coordination logic again.
4. Record the outcome in this file before changing release-day operating limits.

Recommended first dry-run assumptions:
- use `BIRCH`
- use `-c 2`
- use `--dryRun --headed`
- do not use multi-account or multi-hold yet
- if CAPTCHA appears during session validation, complete it manually and continue

## Run Status Summary
| Scenario | Status | Last Run | Notes |
| --- | --- | --- | --- |
| 1. Single account, dry run | Completed | 2026-03-09 | Auth/session path validated; scheduled dry run reached site details for BC85 on 05/08/2026 |
| 2. Single account, live `--book` | Completed | 2026-03-09 | Browser search path was fixed, checkout CAPTCHA handoff worked, and Agent 2 secured BH08 in cart |
| 3. Multi-account, single mode | Completed | 2026-03-09 | Both account sessions renewed and all four agents completed timed launch with `no-candidates` |
| 4. Multi-account, multi mode | Completed | 2026-03-10 | Two accounts secured BH09 and BH11 in separate carts on 05/22/2026, carts opened successfully, and `maxHolds=2` was reached without duplicate-site holds |

## Run Template
Copy this block for each validation run.

### Run ID
- Date:
- Time:
- Operator:
- Scenario:
- Environment:
  worktree, branch, headed/headless

### Command
```bash
npm run race -- ...
```

### Accounts and Sessions
- Accounts used:
- Expected session files:
- Session validation result:
  active, renewed, manual login required, failed

### Launch Setup
- Target arrival date:
- Loop:
- Concurrency:
- Booking mode:
- Max holds:
- Launch mode:
- Checkout auth mode:
- Sites allowlist:

### Outcome
- Result:
  no availability, dry-run success, hold secured, partial success, failed
- Holds secured:
- Which account received each hold:
- Duplicate prevention behavior:
- Cart opening result:

### CAPTCHA and Manual Handoff
- CAPTCHA encountered:
  yes/no
- Stage:
  session login, checkout login, cart transition, none
- Manual intervention required:
  yes/no
- Notes:

### Evidence
- Run summary file:
- Debug HTML:
- Screenshots:
- Console notes:

### Issues Found
- Issue 1:
- Issue 2:
- Issue 3:

### Decision
- Safe to repeat:
  yes/no
- Safe for release day:
  yes/no
- Follow-up required:

## Scenario Records

### Scenario 1: Single account, dry run
Status:
Completed. Session creation, session reuse/renewal, timed launch, candidate-site discovery, and site-details navigation have all been exercised in dry-run mode.

Runs:

### Run ID
- Date: 2026-03-09
- Time: approximately 5:09 PM America/Denver
- Operator: Codex + user
- Scenario: 1. Single account, dry run
- Environment:
  worktree `b5d4`, branch `codex/pull-latest-from-github`, headed

### Command
```bash
npm run race -- -d 04/03/2026 -l 3 -o BIRCH -m 5 -c 2 --dryRun --headed
```

### Accounts and Sessions
- Accounts used:
  default account
- Expected session files:
  `.sessions/session.json`
- Session validation result:
  active after manual auth and session save

### Launch Setup
- Target arrival date:
  04/03/2026
- Loop:
  BIRCH
- Concurrency:
  2
- Booking mode:
  single
- Max holds:
  1
- Launch mode:
  preload
- Checkout auth mode:
  manual by default because run was headed
- Sites allowlist:
  none

### Outcome
- Result:
  no availability
- Holds secured:
  none
- Which account received each hold:
  none
- Duplicate prevention behavior:
  not exercised
- Cart opening result:
  not exercised

### CAPTCHA and Manual Handoff
- CAPTCHA encountered:
  no
- Stage:
  none
- Manual intervention required:
  yes
- Notes:
  manual intervention was required during `npm run auth`, not during the dry run itself

### Evidence
- Run summary file:
  none captured for this monitoring-only outcome
- Debug HTML:
  none
- Screenshots:
  none
- Console notes:
  first poll reported `No exact-date availability for 04/03/2026. Retrying in 5 minute(s).`

### Issues Found
- Issue 1:
  using `-m 5` turns the command into a long-running monitor loop, which is not ideal for a quick validation scenario when availability is absent
- Issue 2:
  this scenario did not exercise site-details or checkout-path behavior because exact-date availability was not found
- Issue 3:
  none yet beyond the need to pick a validation mode that can prove more of the flow

### Decision
- Safe to repeat:
  yes
- Safe for release day:
  partially; auth/session path is validated, but capture-path behavior is not yet validated
- Follow-up required:
  run Scenario 1 again with a command that validates the launch/browser path more directly

### Run ID
- Date: 2026-03-09
- Time: approximately 5:10 PM America/Denver
- Operator: Codex + user
- Scenario: 1. Single account, dry run
- Environment:
  worktree `b5d4`, branch `codex/pull-latest-from-github`, headed

### Command
```bash
npm run race -- -d 05/08/2026 -l 3 -o BIRCH -c 2 --dryRun --headed
```

### Accounts and Sessions
- Accounts used:
  default account
- Expected session files:
  `.sessions/session.json`
- Session validation result:
  existing session reused

### Launch Setup
- Target arrival date:
  05/08/2026
- Loop:
  BIRCH
- Concurrency:
  2
- Booking mode:
  single
- Max holds:
  1
- Launch mode:
  preload
- Checkout auth mode:
  manual by default because run was headed
- Sites allowlist:
  none

### Outcome
- Result:
  no availability
- Holds secured:
  none
- Which account received each hold:
  none
- Duplicate prevention behavior:
  not exercised
- Cart opening result:
  not exercised

### CAPTCHA and Manual Handoff
- CAPTCHA encountered:
  no
- Stage:
  none
- Manual intervention required:
  no
- Notes:
  browser launch did not occur because no exact-date availability was detected

### Evidence
- Run summary file:
  `logs/summary-2026-03-09T23-10-31-211Z.json`
- Debug HTML:
  none
- Screenshots:
  none
- Console notes:
  `No exact-date availability detected. Skipping browser launch.`

### Issues Found
- Issue 1:
  one-shot dry runs without availability validate session reuse and summary output, but they still do not prove the site-details path
- Issue 2:
  validation still needs a scenario that actually triggers browser launch
- Issue 3:
  none beyond the lack of qualifying inventory

### Decision
- Safe to repeat:
  yes
- Safe for release day:
  partially; session reuse looks good, but launch/capture behavior still needs proof
- Follow-up required:
  choose a validation scenario that forces browser launch, such as a scheduled dry run or a known-open target

### Run ID
- Date: 2026-03-09
- Time: approximately 5:12 PM to 5:13 PM America/Denver
- Operator: Codex + user
- Scenario: 1. Single account, dry run
- Environment:
  worktree `b5d4`, branch `codex/pull-latest-from-github`, headed, scheduled launch

### Command
```bash
npm run race -- -d 05/08/2026 -l 3 -o BIRCH -c 2 -t 17:13:00 --dryRun --headed
```

### Accounts and Sessions
- Accounts used:
  default account
- Expected session files:
  `.sessions/session.json`
- Session validation result:
  renewed during pre-flight, then reused by agents

### Launch Setup
- Target arrival date:
  05/08/2026
- Loop:
  BIRCH
- Concurrency:
  2
- Booking mode:
  single
- Max holds:
  1
- Launch mode:
  preload
- Checkout auth mode:
  manual by default because run was headed
- Sites allowlist:
  none

### Outcome
- Result:
  dry-run success
- Holds secured:
  dry-run site-details success for `BC85`
- Which account received each hold:
  default account
- Duplicate prevention behavior:
  both agents initially targeted `BC85`; Agent 2 won the site-details race and the account coordinator closed out the account afterward
- Cart opening result:
  not exercised because this was `--dryRun`

### CAPTCHA and Manual Handoff
- CAPTCHA encountered:
  no explicit CAPTCHA reported during the dry run itself
- Stage:
  session pre-flight required manual login/refresh path
- Manual intervention required:
  yes
- Notes:
  pre-flight session renewal triggered a headed manual login path before agents launched

### Evidence
- Run summary file:
  `logs/summary-2026-03-09T23-13-46-021Z.json`
- Debug HTML:
  none
- Screenshots:
  none recorded
- Console notes:
  both agents preloaded, fired exactly at `2026-03-09T23:13:00.000Z`, and Agent 2 opened site details for `BC85`

### Issues Found
- Issue 1:
  session pre-flight still needed a manual renewal path even though auth had just been run, which is worth understanding before release day
- Issue 2:
  both agents attempted the same preferred site (`BC85`) before coordination closed the loser, so site allocation can still be improved
- Issue 3:
  Agent 1 terminated with `page.goto: Target page, context or browser has been closed`, which is likely benign loser cleanup but should be recognized as expected behavior or cleaned up

### Decision
- Safe to repeat:
  yes
- Safe for release day:
  for dry-run browser-path validation, yes; live `--book` and multi-account behavior still need validation
- Follow-up required:
  move to Scenario 2 and later improve per-agent site allocation to reduce duplicate first picks

Recommended first command:

```bash
npm run race -- -d MM/DD/YYYY -l 3 -o BIRCH -m 5 -c 2 --dryRun --headed
```

Preflight:
- [ ] `npm run auth` completed successfully
- [ ] `.sessions/session.json` exists
- [ ] Playwright browsers are installed
- [ ] operator is ready to solve CAPTCHA manually if prompted

### Scenario 2: Single account, live `--book`
Status:
Completed. The live booking path now reaches a real cart hold with manual checkout login/CAPTCHA handoff, though per-site cart conversion is still not deterministic.

Runs:

### Run ID
- Date: 2026-03-09
- Time: approximately 5:15 PM America/Denver
- Operator: Codex + user
- Scenario: 2. Single account, live `--book`
- Environment:
  worktree `b5d4`, branch `codex/pull-latest-from-github`, headed

### Command
```bash
npm run race -- -d 05/08/2026 -l 3 -o BIRCH -c 2 --book --headed --checkoutAuthMode manual
```

### Accounts and Sessions
- Accounts used:
  default account
- Expected session files:
  `.sessions/session.json`
- Session validation result:
  not exercised because the run ended before pre-flight due to no exact-date availability

### Launch Setup
- Target arrival date:
  05/08/2026
- Loop:
  BIRCH
- Concurrency:
  2
- Booking mode:
  single
- Max holds:
  1
- Launch mode:
  preload
- Checkout auth mode:
  manual
- Sites allowlist:
  none

### Outcome
- Result:
  no availability
- Holds secured:
  none
- Which account received each hold:
  none
- Duplicate prevention behavior:
  not exercised
- Cart opening result:
  not exercised

### CAPTCHA and Manual Handoff
- CAPTCHA encountered:
  no
- Stage:
  none
- Manual intervention required:
  no
- Notes:
  the run ended before browser launch

### Evidence
- Run summary file:
  `logs/summary-2026-03-09T23-15-44-093Z.json`
- Debug HTML:
  none
- Screenshots:
  none
- Console notes:
  `No exact-date availability detected. Skipping browser launch.`

### Issues Found
- Issue 1:
  immediate one-shot live runs are unreliable for validation when availability is transient

### Decision
- Safe to repeat:
  yes
- Safe for release day:
  not sufficient as validation evidence by itself
- Follow-up required:
  use a timed launch to exercise the live booking path

### Run ID
- Date: 2026-03-09
- Time: approximately 5:16 PM to 5:18 PM America/Denver
- Operator: Codex + user
- Scenario: 2. Single account, live `--book`
- Environment:
  worktree `b5d4`, branch `codex/pull-latest-from-github`, headed, scheduled launch

### Command
```bash
npm run race -- -d 05/08/2026 -l 3 -o BIRCH -c 2 -t 17:17:30 --book --headed --checkoutAuthMode manual
```

### Accounts and Sessions
- Accounts used:
  default account
- Expected session files:
  `.sessions/session.json`
- Session validation result:
  renewed during pre-flight, then reused by agents

### Launch Setup
- Target arrival date:
  05/08/2026
- Loop:
  BIRCH
- Concurrency:
  2
- Booking mode:
  single
- Max holds:
  1
- Launch mode:
  preload
- Checkout auth mode:
  manual
- Sites allowlist:
  none

### Outcome
- Result:
  failed before cart hold
- Holds secured:
  none
- Which account received each hold:
  none
- Duplicate prevention behavior:
  improved versus the dry run: Agent 1 skipped `BC85` while another agent was already attempting it, then waited before trying `BC86`
- Cart opening result:
  not exercised

### CAPTCHA and Manual Handoff
- CAPTCHA encountered:
  no explicit checkout CAPTCHA reported
- Stage:
  session pre-flight required manual login/refresh path
- Manual intervention required:
  yes
- Notes:
  manual interaction was needed for pre-flight renewal, but the booking failure itself was a missing/undetected booking button, not a CAPTCHA event

### Evidence
- Run summary file:
  `logs/summary-2026-03-09T23-18-46-962Z.json`
- Debug HTML:
  none
- Screenshots:
  none recorded
- Console notes:
  both agents fired at `2026-03-09T23:17:30.000Z`; both later failed with `locator.click: Timeout 30000ms exceeded` while waiting for `#btnbookdates, #btnbooknow, button:has-text("Book Now")`

### Issues Found
- Issue 1:
  both agents reached candidate-site selection but timed out waiting for the booking button selector on site-details pages
- Issue 2:
  session pre-flight again required manual renewal before launch
- Issue 3:
  the run summary status is `no-availability`, but the real failure mode was deeper: candidate sites existed and the booking control was not found

### Decision
- Safe to repeat:
  yes
- Safe for release day:
  not yet; live booking is blocked by the current booking-button detection path
- Follow-up required:
  inspect the site-details DOM and fix or harden the selector logic used to find the booking button

### Run ID
- Date: 2026-03-09
- Time: approximately 5:20 PM to 5:22 PM America/Denver
- Operator: Codex + user
- Scenario: 2. Single account, live `--book`
- Environment:
  worktree `b5d4`, branch `codex/pull-latest-from-github`, headed, scheduled launch, patched booking diagnostics

### Command
```bash
npm run race -- -d 05/08/2026 -l 3 -o BIRCH -c 2 -t 17:22:00 --book --headed --checkoutAuthMode manual
```

### Accounts and Sessions
- Accounts used:
  default account
- Expected session files:
  `.sessions/session.json`
- Session validation result:
  renewed during pre-flight, then reused by agents

### Launch Setup
- Target arrival date:
  05/08/2026
- Loop:
  BIRCH
- Concurrency:
  2
- Booking mode:
  single
- Max holds:
  1
- Launch mode:
  preload
- Checkout auth mode:
  manual
- Sites allowlist:
  none

### Outcome
- Result:
  failed before cart hold
- Holds secured:
  none
- Which account received each hold:
  none
- Duplicate prevention behavior:
  active throughout the candidate list; agents were serialized and prevented from attempting the same site simultaneously
- Cart opening result:
  not exercised

### CAPTCHA and Manual Handoff
- CAPTCHA encountered:
  no explicit checkout CAPTCHA reported
- Stage:
  session pre-flight required manual login/refresh path
- Manual intervention required:
  yes
- Notes:
  the booking failure itself was not a CAPTCHA issue

### Evidence
- Run summary file:
  `logs/summary-2026-03-09T23-22-32-421Z.json`
- Debug HTML:
  multiple `logs/debug-order-details-button-missing-*.html` artifacts saved
- Screenshots:
  matching `logs/debug-order-details-button-missing-*.png` artifacts saved
- Console notes:
  each candidate site saved a debug artifact instead of failing immediately

### Issues Found
- Issue 1:
  the saved site-details pages show `No suitable availability shown`, so these candidates were not actually bookable for the requested stay even though they came through the candidate-selection path
- Issue 2:
  `matrixHasError=true` and the rendered page lacks a usable transition control to `Order Details`, which means the problem is upstream of checkout
- Issue 3:
  live booking is currently spending time on false-positive candidate sites

### Decision
- Safe to repeat:
  yes
- Safe for release day:
  not yet; false-positive site selection needs to be reduced before the live hold path can be trusted
- Follow-up required:
  tighten candidate filtering or add an early site-details availability check before attempting to transition to `Order Details`

### Follow-up Engineering Result
- Date: 2026-03-09
- Change:
  tightened browser candidate filtering in `src/automation.ts` so a row must show bookable leading status cells for the requested `lengthOfStay` before it becomes a candidate
- Validation:
  `npx tsc --noEmit` passed
  `npx jest --runInBand` passed
- Verification run:
```bash
npm run race -- -d 05/08/2026 -l 3 -o BIRCH -c 2 -t 17:27:30 --dryRun --headed
```
- Verification summary:
  `logs/summary-2026-03-09T23-27-45-251Z.json`
- Result:
  both agents ended with `no-candidates` for the same date that previously produced false-positive candidate sites
- Interpretation:
  the bogus browser candidate list is now blocked for this scenario; the system no longer burns time walking non-bookable sites for `05/08/2026`

### Follow-up Engineering Result
- Date: 2026-03-09
- Change:
  replaced the browser search-form path with native form submission, added loop-aware search-results debug artifacts, and merged split ReserveAmerica result rows by site ID so each candidate combines its `See Details` action row with its calendar-status row
- Validation:
  `npx tsc --noEmit` passed
  `npx jest --runInBand tests/parser.test.ts tests/site-targeting.test.ts` passed
- Verification run:
```bash
npm run race -- -d 05/22/2026 -l 2 -o BIRCH -c 2 --book --headed --checkoutAuthMode manual
```
- Verification summary:
  `logs/summary-2026-03-10T03-02-28-183Z.json`
- Result:
  the browser run matched the HTTP-discovered `BH*` sites in `BIRCH`, Agent 1 failed to move `BH03` into cart, and Agent 2 secured `BH08` in the shopping cart after manual checkout login/CAPTCHA handoff
- Interpretation:
  the core single-account booking path is now validated end to end through cart hold, and the remaining risk is site-specific cart conversion variance rather than search/result parsing mismatch

### Run ID
- Date: 2026-03-09
- Time: approximately 8:57 PM to 9:02 PM America/Denver
- Operator: Codex + user
- Scenario: 2. Single account, live `--book`
- Environment:
  worktree `b5d4`, branch `codex/pull-latest-from-github`, headed, live booking target with manual checkout auth

### Command
```bash
npm run race -- -d 05/22/2026 -l 2 -o BIRCH -c 2 --book --headed --checkoutAuthMode manual
```

### Accounts and Sessions
- Accounts used:
  default account
- Expected session files:
  `.sessions/session.json`
- Session validation result:
  renewed during pre-flight, then reused by both agents

### Launch Setup
- Target arrival date:
  05/22/2026
- Loop:
  BIRCH
- Concurrency:
  2
- Booking mode:
  single
- Max holds:
  1
- Launch mode:
  preload
- Checkout auth mode:
  manual
- Sites allowlist:
  none

### Outcome
- Result:
  hold secured
- Holds secured:
  one
- Which account received each hold:
  default account: `BH08`
- Duplicate prevention behavior:
  working; Agent 2 waited behind Agent 1, Agent 1 skipped `BH08` once Agent 2 owned it, and remaining agents were closed after the first hold was secured
- Cart opening result:
  successful for `BH08`; unsuccessful for `BH03`

### CAPTCHA and Manual Handoff
- CAPTCHA encountered:
  yes
- Stage:
  checkout login after Agent 1 reached `Order Details`
- Manual intervention required:
  yes
- Notes:
  manual sign-in/CAPTCHA completion did not immediately show the cart page, but the script resumed correctly once checkout login was satisfied

### Evidence
- Run summary file:
  `logs/summary-2026-03-10T03-02-28-183Z.json`
- Debug HTML:
  `logs/debug-search-results-default-1773111403114.html`
- Screenshots:
  `logs/cart-agent-2-BH08-1773111747937.png`
  `logs/fail-cart-agent-1-BH03-1773111744316.png`
- Console notes:
  Agent 1 reached `Order Details` for `BH03`, hit checkout CAPTCHA, later failed to move `BH03` into cart; Agent 2 then reached `Order Details` for `BH08` and secured the cart hold

### Issues Found
- Issue 1:
  the ReserveAmerica browser results DOM splits each site into a details row and a status-calendar row, so candidate extraction had to merge rows by site ID
- Issue 2:
  the site rewrites the entered date string in the search form, so browser validation must compare the calendar day rather than the raw `MM/DD/YYYY` text
- Issue 3:
  not every valid candidate converts equally; `BH03` failed at cart transition while `BH08` succeeded in the same run

### Decision
- Safe to repeat:
  yes
- Safe for release day:
  yes for the single-account capture path with manual CAPTCHA handoff; multi-account real-hold behavior still needs a comparable target
- Follow-up required:
  preserve this parser/browser fix, then validate Scenario 3 or 4 against a target that can exercise cross-account hold routing

### Scenario 3: Multi-account, single mode
Status:
Completed for the two-account session-routing and timed launch path. No candidate sites were found, so hold routing and cart behavior were not exercised.

Runs:

### Run ID
- Date: 2026-03-09
- Time: approximately 8:32 PM to 8:33 PM America/Denver
- Operator: Codex + user
- Scenario: 3. Multi-account, single mode
- Environment:
  worktree `b5d4`, branch `codex/pull-latest-from-github`, headed, scheduled launch

### Command
```bash
npm run race -- -d 05/08/2026 -l 3 -o BIRCH -c 4 -t 20:33:30 --book --accounts lisarichards1984@gmail.com,jrichards1981@gmail.com --bookingMode single --headed --checkoutAuthMode manual
```

### Accounts and Sessions
- Accounts used:
  `lisarichards1984@gmail.com`, `jrichards1981@gmail.com`
- Expected session files:
  `.sessions/session-lisarichards1984.json`
  `.sessions/session-jrichards1981.json`
- Session validation result:
  both accounts renewed successfully during pre-flight

### Launch Setup
- Target arrival date:
  05/08/2026
- Loop:
  BIRCH
- Concurrency:
  4
- Booking mode:
  single
- Max holds:
  1
- Launch mode:
  preload
- Checkout auth mode:
  manual
- Sites allowlist:
  none

### Outcome
- Result:
  no availability / no candidates
- Holds secured:
  none
- Which account received each hold:
  none
- Duplicate prevention behavior:
  not exercised because candidate lists were empty for all agents
- Cart opening result:
  not exercised

### CAPTCHA and Manual Handoff
- CAPTCHA encountered:
  no explicit CAPTCHA reported
- Stage:
  both accounts went through headed manual pre-flight renewal
- Manual intervention required:
  yes
- Notes:
  both account sessions had to be refreshed during pre-flight, but the run proceeded normally afterward

### Evidence
- Run summary file:
  `logs/summary-2026-03-10T02-33-45-343Z.json`
- Debug HTML:
  none
- Screenshots:
  none
- Console notes:
  all four agents preloaded and fired at `2026-03-10T02:33:30.000Z`

### Issues Found
- Issue 1:
  two-account session files exist and are usable, but both still required renewal at launch time
- Issue 2:
  no-candidate outcome means this scenario did not validate cross-account hold routing yet
- Issue 3:
  no cart-opening behavior was exercised

### Decision
- Safe to repeat:
  yes
- Safe for release day:
  for session-routing and launch validation, yes; for cross-account hold behavior, not yet
- Follow-up required:
  run Scenario 3 again against a release-window target or known-bookable case so at least one account receives a real hold attempt

### Scenario 4: Multi-account, multi mode
Status:
Completed for both the session-routing path and a real multi-hold validation path. The 2026-03-10 closeout run exercised two-account hold routing against a known-bookable target, reached two distinct cart holds, opened both carts successfully, and provided the evidence needed to close Phase 1.

Runs:

### Run ID
- Date: 2026-03-09
- Time: approximately 8:35 PM to 8:37 PM America/Denver
- Operator: Codex + user
- Scenario: 4. Multi-account, multi mode
- Environment:
  worktree `b5d4`, branch `codex/pull-latest-from-github`, headed, scheduled launch

### Command
```bash
npm run race -- -d 05/08/2026 -l 3 -o BIRCH -c 4 -t 20:37:00 --book --accounts lisarichards1984@gmail.com,jrichards1981@gmail.com --bookingMode multi --maxHolds 2 --headed --checkoutAuthMode manual
```

### Accounts and Sessions
- Accounts used:
  `lisarichards1984@gmail.com`, `jrichards1981@gmail.com`
- Expected session files:
  `.sessions/session-lisarichards1984.json`
  `.sessions/session-jrichards1981.json`
- Session validation result:
  both accounts renewed successfully during pre-flight

### Launch Setup
- Target arrival date:
  05/08/2026
- Loop:
  BIRCH
- Concurrency:
  4
- Booking mode:
  multi
- Max holds:
  2
- Launch mode:
  preload
- Checkout auth mode:
  manual
- Sites allowlist:
  none

### Outcome
- Result:
  no availability / no candidates
- Holds secured:
  none
- Which account received each hold:
  none
- Duplicate prevention behavior:
  not exercised because candidate lists were empty for all agents
- Cart opening result:
  not exercised

### CAPTCHA and Manual Handoff
- CAPTCHA encountered:
  no explicit CAPTCHA reported
- Stage:
  both accounts went through headed manual pre-flight renewal
- Manual intervention required:
  yes
- Notes:
  both account sessions had to be refreshed during pre-flight, but the run proceeded normally afterward

### Evidence
- Run summary file:
  `logs/summary-2026-03-10T02-37-15-427Z.json`
- Debug HTML:
  none
- Screenshots:
  none
- Console notes:
  all four agents preloaded and fired at `2026-03-10T02:37:00.000Z`

### Issues Found
- Issue 1:
  two-account multi-mode session routing is valid, but no candidate sites were present to exercise hold registration
- Issue 2:
  max-hold enforcement in real conditions remains unvalidated because there were zero candidate sites
- Issue 3:
  both accounts still required pre-flight renewal

### Decision
- Safe to repeat:
  yes
- Safe for release day:
  yes within the documented operating limits, with headed/manual checkout handoff and pre-flight session renewal expected
- Follow-up required:
  use this scenario as the baseline for release-window rehearsals and Phase 2 targeting work

### Run ID
- Date: 2026-03-10
- Time: approximately 9:12 AM America/Denver
- Operator: Codex + user
- Scenario: 4. Multi-account, multi mode
- Environment:
  local workspace, branch `main`, headed, immediate launch

### Command
```bash
npm run race -- -d 05/22/2026 -l 3 -o BIRCH -c 4 --book --accounts lisarichards1984@gmail.com,jrichards1981@gmail.com --bookingMode multi --maxHolds 2 --sites BH08,BH09,BH11 --headed --checkoutAuthMode manual
```

### Accounts and Sessions
- Accounts used:
  `lisarichards1984@gmail.com`, `jrichards1981@gmail.com`
- Expected session files:
  `.sessions/session-lisarichards1984.json`
  `.sessions/session-jrichards1981.json`
- Session validation result:
  both accounts required headed pre-flight renewal, then validated successfully and were reused by `view-cart`

### Launch Setup
- Target arrival date:
  05/22/2026
- Loop:
  BIRCH
- Concurrency:
  4
- Booking mode:
  multi
- Max holds:
  2
- Launch mode:
  preload
- Checkout auth mode:
  manual
- Sites allowlist:
  `BH08,BH09,BH11`

### Outcome
- Result:
  hold secured
- Holds secured:
  `BH09`, `BH11`
- Which account received each hold:
  `lisarichards1984@gmail.com` -> `BH09`
  `jrichards1981@gmail.com` -> `BH11`
- Duplicate prevention behavior:
  no duplicate-site hold occurred; each winning account captured a different allowlisted site, and the remaining agents finished with `no-candidates` after the two holds were secured
- Cart opening result:
  `npm run view-cart -- --accounts lisarichards1984@gmail.com,jrichards1981@gmail.com` verified both sessions as active and opened both carts successfully

### CAPTCHA and Manual Handoff
- CAPTCHA encountered:
  no explicit checkout CAPTCHA reported during the hold capture itself
- Stage:
  both accounts required headed manual pre-flight renewal before the live run
- Manual intervention required:
  yes
- Notes:
  manual interaction was needed before launch to refresh both account sessions; once the holds were secured, both carts opened with the saved sessions and were ready for manual checkout

### Evidence
- Run summary file:
  `logs/summary-2026-03-10T15-12-56-748Z.json`
- Debug HTML:
  `logs/debug-search-results-lisarichards1984-1773155571001.html`
  `logs/debug-search-results-jrichards1981-1773155574453.html`
- Screenshots:
  `logs/cart-agent-1-BH09-1773155568380.png`
  `logs/cart-agent-2-BH11-1773155571113.png`
- Console notes:
  the allowlist was applied, Agent 1 held `BH09`, Agent 2 held `BH11`, and `accountsWithHolds` included both configured accounts

### Issues Found
- Issue 1:
  recently saved sessions can still require headed pre-flight renewal immediately before a live run
- Issue 2:
  the operator still needs to stay present for checkout and any post-cart CAPTCHA even when the cart hold itself succeeds cleanly
- Issue 3:
  the allowlist and `maxHolds=2` cap worked well for a focused closeout run, but broader release-window targeting still belongs in Phase 2

### Decision
- Safe to repeat:
  yes
- Safe for release day:
  yes within the documented operating limits: headed/manual mode, pre-flight renewal, tight site allowlists, and manual checkout handoff
- Follow-up required:
  move to Phase 2 release-window execution work; keep using this run as the reference multi-mode baseline

## Phase 1 Exit Check
- [x] README and docs reflect the current workflow
- [x] Single-account dry run completed and recorded
- [x] Single-account live `--book` completed and recorded
- [x] Multi-account single mode completed and recorded
- [x] Multi-account multi mode completed and recorded
- [x] CAPTCHA behavior documented
- [x] Session renewal behavior documented
- [x] Cart-opening behavior documented
- [x] Known operating limits written down

## Open Risks
- Risk 1:
- pre-flight session renewal is still frequently needed, which adds operator work close to launch time
- Risk 2:
- checkout CAPTCHA can still appear after `Order Details`, so a human must be available during the live race
- Risk 3:
- site-level cart conversion is not uniform; one valid candidate may fail while another succeeds moments later

## Phase 2 Kickoff Probe
On 2026-03-10, after Phase 1 was closed, we ran an exploratory multi-account stress test to see whether the current coordinator could stretch beyond the Phase 1 operating limit of `maxHolds=2`.

### Probe Command
```bash
npm run race -- -d 06/09/2026 -l 3 -o BIRCH -c 6 --book --accounts lisarichards1984@gmail.com,jrichards1981@gmail.com --bookingMode multi --maxHolds 3 --sites BH03,BH04,BH07,BH08,BH09,BH11 --headed --checkoutAuthMode manual
```

### Probe Outcome
- Result:
  partial success
- Holds secured:
  `lisarichards1984@gmail.com` -> `BH04`, `BH08`, `BH11`
  `jrichards1981@gmail.com` -> `BH07`, `BH09`
- Sixth attempt:
  the last agent failed to move `BH11` into cart, so the run finished at 5 total holds instead of 6
- Evidence:
  `logs/summary-2026-03-10T15-21-29-387Z.json`
  `logs/cart-agent-1-BH04-1773156065640.png`
  `logs/cart-agent-2-BH07-1773156068266.png`
  `logs/cart-agent-3-BH08-1773156075798.png`
  `logs/cart-agent-4-BH09-1773156076644.png`
  `logs/cart-agent-5-BH11-1773156080306.png`
  `logs/fail-cart-agent-6-BH11-1773156088661.png`

### What This Proves
- the runtime can coordinate at least 3 holds on a single account
- the global held-site registry still prevented duplicate successful holds across accounts
- the per-account closure logic triggered correctly once `lisarichards1984@gmail.com` reached `maxHolds=3`

### What Phase 2 Must Improve
- late-stage candidate allocation still needs work so the second account can keep pursuing a distinct third site instead of collapsing onto an already-contended target
- allowlist ranking for second and third holds should prefer distinct, high-confidence sites before weaker fallback candidates
- release-window execution needs stronger scout discovery and per-account stop logic so 6-agent runs can reliably convert into 6 total holds when inventory exists

### Post-Fix Validation
After implementing the first Phase 2 coordination slice, we reran the same `maxHolds=3` scenario.

- Command:
  `npm run race -- -d 06/09/2026 -l 3 -o BIRCH -c 6 --book --accounts lisarichards1984@gmail.com,jrichards1981@gmail.com --bookingMode multi --maxHolds 3 --sites BH03,BH04,BH07,BH08,BH09,BH11 --headed --checkoutAuthMode manual`
- Evidence:
  `logs/summary-2026-03-10T15-40-52-519Z.json`
  `logs/fail-cart-agent-1-BH08-1773157228032.png`
  `logs/fail-cart-agent-2-BH11-1773157230711.png`
  `logs/fail-cart-agent-4-BH08-1773157239619.png`
  `logs/fail-cart-agent-3-BH11-1773157251574.png`
- Outcome:
  no holds landed, but the coordinator no longer seeded every agent with the stale `BH03` preference; the first live attempts split across `BH08` and `BH11`, and later same-account agents skipped in-flight or already-failed sites instead of repeating them
- Interpretation:
  the specific late-stage convergence bug was reduced, but this run only exposed two live allowlisted browser candidates and both repeatedly failed at cart transition, so the remaining blocker looked like site-level cart conversion rather than coordinator reuse of a stale preferred site
- Next validation target:
  rerun the Phase 2 probe with a fresh six-site allowlist taken from the live HTTP scout immediately before launch so the coordinator is tested against a broader set than `BH08` and `BH11`

### Successful 6-Hold Validation
After hardening cart confirmation detection and rerunning with a fresh six-site allowlist from the live scout, the Phase 2 `maxHolds=3` scenario reached the full 6-hold objective.

- Command:
  `npm run race -- -d 05/22/2026 -l 3 -o BIRCH -c 6 --book --accounts lisarichards1984@gmail.com,jrichards1981@gmail.com --bookingMode multi --maxHolds 3 --sites BH03,BH09,BH11,BH12,BH13,BH22 --headed --checkoutAuthMode manual`
- Evidence:
  `logs/summary-2026-03-10T17-15-00-167Z.json`
  `logs/cart-agent-1-BH03-1773162885641.png`
  `logs/cart-agent-2-BH09-1773162888588.png`
  `logs/cart-agent-3-BH11-1773162892017.png`
  `logs/cart-agent-4-BH12-1773162894273.png`
  `logs/cart-agent-5-BH13-1773162896490.png`
  `logs/cart-agent-6-BH22-1773162898626.png`
- Outcome:
  success; `lisarichards1984@gmail.com` secured `BH03`, `BH11`, and `BH13`, while `jrichards1981@gmail.com` secured `BH09`, `BH12`, and `BH22`
- What this proves:
  the account-aware allocator now fans out cleanly across six distinct targets
  per-account stop logic closes each account exactly at `maxHolds=3`
  cart confirmation is now truthful even when ReserveAmerica stays on `switchBookingAction.do`, because the run summary recorded the correct before/after cart contents for all six successful agents
- Remaining Phase 2 focus:
  pre-8:00 scout discovery and allowlist generation immediately before launch
  tighter warm-up and launch timing around the release window
  operational release rehearsal using the now-proven six-hold coordination path
