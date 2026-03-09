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
Current blocker: this worktree does not yet have a `.sessions/` directory, so Scenario 1 cannot run until at least one account session is created.

Use this sequence first:

1. Authenticate the default or first account:
   `npm run auth`
2. Confirm `.sessions/session.json` exists.
3. Run Scenario 1:
   `npm run race -- -d MM/DD/YYYY -l 3 -o BIRCH -m 5 -c 2 --dryRun --headed`
4. Record the outcome in this file.

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
| 2. Single account, live `--book` | In progress | 2026-03-09 | False-positive candidates diagnosed; follow-up timed dry run now returns `no-candidates` for the same date |
| 3. Multi-account, single mode | Not started | - | - |
| 4. Multi-account, multi mode | Not started | - | - |

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
In progress. Immediate one-shot run found no availability; scheduled live run exercised the booking path but failed before cart hold because the booking-button locator timed out on site-details pages.

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

### Scenario 3: Multi-account, single mode
Status:

Runs:

### Scenario 4: Multi-account, multi mode
Status:

Runs:

## Phase 1 Exit Check
- [ ] README and docs reflect the current workflow
- [ ] Single-account dry run completed and recorded
- [ ] Single-account live `--book` completed and recorded
- [ ] Multi-account single mode completed and recorded
- [ ] Multi-account multi mode completed and recorded
- [ ] CAPTCHA behavior documented
- [ ] Session renewal behavior documented
- [ ] Cart-opening behavior documented
- [ ] Known operating limits written down

## Open Risks
- Risk 1:
- Risk 2:
- Risk 3:
