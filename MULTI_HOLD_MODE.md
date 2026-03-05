# Multi-Hold Mode Design

## Purpose
Define a separate booking mode for users who want to intentionally hold more than one site at the same time.

This is not the same as the current single-winner race flow.

## Why A Separate Mode Is Needed
The current `--book` behavior assumes one desired outcome:
- first agent to reach `Order Details` wins,
- all other agents are cancelled.

That is correct for a single-site objective, but wrong for a multi-site objective because:
- multiple holds may be intentional,
- different sites may be acceptable substitutes,
- cancellation would discard valid backup holds.

## Proposed Modes
### `bookingMode=single`
Current behavior.

Rules:
- first successful hold wins,
- cancel all remaining agents,
- send one success notification,
- stop at `Order Details`.

### `bookingMode=multi`
New behavior.

Rules:
- allow more than one successful hold,
- stop only when hold target is reached or candidates are exhausted,
- record every successful hold,
- never place duplicate holds for the same site,
- still stop at `Order Details` for each hold.

## CLI Design
Add these options to `src/race.ts`:
- `--bookingMode single|multi`
- `--maxHolds <number>`
- `--siteAllowlist <csv>`
- `--siteDenylist <csv>`
- `--stopAfterFirstPerLoop`

Recommended defaults:
- `bookingMode=single`
- `maxHolds=1`

Example commands:
- Single winner:
  - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 2 --book --bookingMode single`
- Multi hold up to 3 sites:
  - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 5 --book --bookingMode multi --maxHolds 3`

## Data Model
Replace the single winner state with a richer run state.

Suggested structure:
```ts
type HoldRecord = {
  agentId: number;
  site: string;
  loop: string;
  arrivalDate: string;
  stage: 'site-details' | 'order-details';
  finalUrl: string;
  timestamp: string;
};

type RunState = {
  bookingMode: 'single' | 'multi';
  winningAgentId: number | null;
  holds: HoldRecord[];
  heldSites: Set<string>;
  maxHolds: number;
  isClosed: boolean;
};
```

## Booking Rules
### Rule 1: No duplicate site holds
- If `BH07` is already held, no other agent may continue for `BH07`.
- The held-site registry must be checked before continuing from site details to `Order Details`.

### Rule 2: Explicit hold cap
- `maxHolds` is required for `multi`.
- Once `holds.length >= maxHolds`, cancel all remaining agents.

### Rule 3: Same-site collisions lose immediately
- If two agents converge on the same site, only the first one may continue.
- The second one should close before submitting the hold transition.

### Rule 4: Stop at `Order Details`
- Multi-hold mode should still stop at `Order Details`.
- Do not continue into `Review Cart`, `Checkout`, or payment.

## Account And Cart Constraints
This mode is riskier than single-winner mode because all holds likely land in the same account/cart.

Known risks:
- cart mutation by one agent may affect another agent,
- one agent may invalidate the page state of another,
- the site may reject or throttle rapid sequential holds,
- account rules may limit how many holds can coexist.

## Recommended Architecture
### 1. Shared run coordinator
Implement a coordinator object in `src/race.ts` or extract to a new helper.

Responsibilities:
- register successful holds,
- reject duplicate sites,
- enforce `maxHolds`,
- cancel outstanding agents when the cap is reached,
- produce a final run summary.

### 2. Persistent profiles become more important
Multi-hold mode should prefer persistent profiles over ephemeral contexts.

Reason:
- each agent may need durable cart/session state,
- failures are easier to inspect afterward,
- cart collisions are easier to debug.

### 3. Site allowlists
Multi-hold mode should support an explicit site allowlist.

Reason:
- if you want three backup sites, the target set should be explicit,
- this reduces accidental holds on less desirable sites.

## Notification Design
Single-mode notification:
- one notification for the winner.

Multi-mode notification:
- one notification per new hold,
- one final summary notification:
  - hold count
  - site list
  - winning/holding agents

## Logging And Summary
For multi-hold mode, write a structured summary file after each run:
- target date
- loop
- concurrency
- booking mode
- max holds
- successful sites
- failed sites
- cancelled agents
- timestamps

Suggested path:
- `logs/run-YYYYMMDD-HHMMSS.json`

## Suggested Rollout
### Phase 1: Design only
- document the mode
- keep runtime behavior unchanged

### Phase 2: Dry coordinator
- add `bookingMode=multi`
- do not allow real holds yet
- simulate hold registration only in `--dryRun`

### Phase 3: Real multi-hold with low cap
- enable real holds with:
  - `--bookingMode multi`
  - `--maxHolds 2`
  - `-c 2`

### Phase 4: Operational hardening
- persistent profiles
- per-agent logs
- structured summaries
- allowlist/denylist support

## Recommended Next Step
Do not implement multi-hold immediately.

Implement these first:
1. persistent per-agent profiles
2. per-agent logs and screenshots
3. `c=4 --dryRun`
4. another `c=2 --book --headed` confirmation

Then add the multi-hold coordinator behind an explicit `--bookingMode multi`.
