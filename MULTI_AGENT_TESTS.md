# Multi-Agent Test Checklist

## Purpose
Use this checklist to validate multi-agent stability before enabling real parallel booking behavior.

## Test Target
- Date: `06/09/2026`
- Length: `6`
- Loop: `BIRCH`
- Mode: `--dryRun` unless explicitly testing `--book`

## Dry-Run Ladder
### Step 1: Single agent baseline
- Command:
  - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 1 --dryRun --headed`
- Pass criteria:
  - exact-date availability is detected,
  - one agent opens site details,
  - no login redirect,
  - no unhandled error.

### Step 2: Two-agent dry run
- Command:
  - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 2 --dryRun`
- Pass criteria:
  - both agents prime and submit successfully,
  - both stay logged in,
  - at least one agent opens site details,
  - no session collision or crash.

### Step 3: Three-agent dry run
- Command:
  - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 3 --dryRun`
- Pass criteria:
  - all agents launch,
  - all agents submit search,
  - at least two agents independently open site details,
  - no login churn.

### Step 4: Five-agent dry run
- Command:
  - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 5 --dryRun`
- Pass criteria:
  - all five agents launch,
  - all five agents submit search,
  - multiple agents reach site details,
  - no cart mutation,
  - no authentication loss.

## Book Boundary Test
Run only after the dry-run ladder is stable.

- Command:
  - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 2 --book --headed`
- Pass criteria:
  - one agent reaches `Order Details`,
  - no second agent reaches `Order Details`,
  - no movement into `Review Cart` or payment,
  - losing agents close cleanly once winner logic exists.

## What To Watch
- login redirects
- timeouts on the results page
- agents selecting different sites
- duplicate notifications
- more than one agent reaching `Order Details`
- row-action mismatches such as `Find Next Avail. Date` being treated like a holdable site

## Recorded Results
### 2026-03-05 dry-run ladder
#### `c=2`
- Command:
  - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 2 --dryRun`
- Result:
  - passed
- Observations:
  - both agents primed and submitted,
  - agent 1 opened `BH07` via `See Details`,
  - agent 2 opened `BH09` via `See Details`,
  - no login redirect or crash.

#### `c=3`
- Command:
  - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 3 --dryRun`
- Result:
  - passed
- Observations:
  - all three agents primed and submitted,
  - agents opened `BH07`, `BH09`, and `BH32`,
  - all observed openings were via safe site-details navigation,
  - no visible authentication failure.

#### `c=5`
- Command:
  - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 5 --dryRun`
- Result:
  - conditional pass
- Observations:
  - all five agents primed and submitted,
  - agents opened `BH07`, `BH09`, `BH32`, `BH60`, and `BH03`,
  - no login redirect or crash,
  - one agent reported action text `Find NextAvail. Date**` while still opening `BH03`.

## Current Conclusion
- The current shared-session, multi-context approach appears stable through `c=5` in `--dryRun`.
- It is not ready for multi-agent `--book` yet.
- Before a real `--book` test, tighten row-action parsing so only true booking-capable states are treated as hold candidates.

## Immediate Follow-Up
1. Constrain row parsing in `src/race.ts` to distinguish:
   - `See Details`
   - `Enter Date`
   - `Find Next Avail. Date`
   - `not available`
2. Re-run the `c=5` dry test after that fix.
3. Only then run `c=2 --book`.
