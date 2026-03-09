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
| 1. Single account, dry run | Not started | - | - |
| 2. Single account, live `--book` | Not started | - | - |
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
Blocked until `.sessions/session.json` exists.

Runs:

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

Runs:

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
