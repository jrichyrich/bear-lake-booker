# Remediation Plan
**Date**: 2026-03-11
**Project**: Bear Lake Booker
**Scope**: All audited feature areas
**Total findings addressed**: 2 critical, 7 warning, 3 note

---

## Fix Dependency Map

Phase 1 (foundational correctness):
- F-001: Fix release wrapper scouting strategy
- F-002: Generalize site ID handling across allowlists and cart parsing
- F-003: Fix default-session auto-login path
- F-004: Align booking-window checks with the 8:00 AM rule
- F-005: Repair keychain account normalization
- F-006: Make `npm test` run the real Jest suite

Phase 2 (depends on Phase 1):
- F-007: Validate numeric CLI inputs in `race.ts` after release/race semantics are stabilized
- F-008: Add direct regression tests for `release.ts`, `race.ts`, `automation.ts`, `index.ts`

Phase 3 (can follow Phase 1 or Phase 2 independently):
- F-009: Reduce arrival-sweep refetch overhead
- F-010: Replace 200ms busy-spin with a lower-impact timing strategy

Explicit dependencies:
- F-001 → before F-008, because release-flow tests should target the corrected strategy
- F-002 → before F-008, because cart and site-list tests need the new site-ID contract
- F-003/F-004/F-005 → before F-008, because monitoring/auth tests should lock the corrected behavior
- F-006 → before CI or automation work built on top of the test suite
- F-007 → before F-008 race CLI tests, so the validated contract is what gets encoded

---

## Work Packages

### Package 1: Release-Day Correctness
**Priority**: Do first
**Estimated scope**: 2-3 days
**Rationale**: These fixes unblock the repo’s primary product goal: winning the 8:00 AM release window without aborting early or misclassifying valid sites.

#### F-001 — Replace exact-date prelaunch scouting in `release.ts`
- **Severity**: 🔴 Critical
- **Location**: `src/release.ts:199`
- **What's wrong**: The wrapper’s default scout only keeps `search.exactDateMatches`, which are expected to be empty before the booking window opens.
- **Scope**: Structural change
- **Estimated effort**: 1-1.5 days
- **Depends on**: none
- **Fix instructions**:
  1. Change the non-projection `resolveTargetSites(...)` path so it does not require exact-date availability before launch.
  2. Use the ranked site list / availability snapshot / recent scouting data as the prelaunch shortlist source.
  3. If live data is still needed at scout time, use broader availability signals (`availableSites`, per-site calendar data, or previous snapshots), not exact-date release availability.
  4. Keep the current projection path, but make the default path consistent with the same mental model: “freeze candidate sites before launch, discover real exact-date openings at launch.”
  5. Update CLI help/README wording so the wrapper behavior is explicit.
- **How to verify**:
  - Add a test showing a prelaunch search with zero `exactDateMatches` still produces a launch plan.
  - Add an integration-style unit test for `release.ts` argument building that proves the wrapper reaches `race.ts` instead of throwing.

#### F-002 — Generalize site ID handling
- **Severity**: 🔴 Critical
- **Location**: `src/site-lists.ts:5`, `src/cart-detection.ts:22`
- **What's wrong**: Two important boundaries assume all valid sites look like `BH##`.
- **Scope**: Structural change
- **Estimated effort**: 1 day
- **Depends on**: none
- **Fix instructions**:
  1. Introduce a shared site-ID normalizer/parser module, for example `src/site-id.ts`.
  2. Replace the hard-coded `BH\d{2}` list parsing rule with a more general Bear Lake-compatible token matcher based on actual site formats used in ReserveAmerica responses.
  3. Replace the cart extraction regex with the same shared matcher so allowlists, cart parsing, and site targeting use one contract.
  4. Update existing tests and add cases for `BC##` and any other known valid prefixes.
  5. Audit README examples and docs so they no longer imply only `BH##` is valid unless that is truly intended.
- **How to verify**:
  - Unit test `parseRankedSiteList` with both `BH##` and `BC##`.
  - Unit test `extractCartSiteIds` with mixed site-code families.
  - Run existing `site-lists` and `cart-detection` suites after extending them.

---

### Package 2: Auth and Booking-Window Consistency
**Priority**: Do second
**Estimated scope**: 1-2 days
**Rationale**: These issues do not block every run, but they create misleading operator behavior and inconsistent account/session handling.

#### F-003 — Fix monitoring-mode auto-login for the default account
- **Severity**: 🟡 Warning
- **Location**: `src/index.ts:42-45`, `src/auth.ts:135-141`
- **What's wrong**: Monitoring mode calls `performAutoLogin([])` when the default session expires, but the implementation loops only over provided accounts, so nothing is renewed.
- **Scope**: Patch
- **Estimated effort**: 1-2 hours
- **Depends on**: none
- **Fix instructions**:
  1. Decide on one contract for `performAutoLogin`: either empty input means “default account” or empty input is invalid.
  2. Make `index.ts` call that contract explicitly.
  3. Update logging so “Attempting auto-renewal” reflects real work.
- **How to verify**:
  - Add a unit test for empty/default-account behavior.
  - Mock the auth path and confirm the default session path is targeted.

#### F-004 — Make booking-window checks honor the 8:00 AM opening threshold
- **Severity**: 🟡 Warning
- **Location**: `src/timer-utils.ts:50-68`
- **What's wrong**: `assertBookingWindow` uses only a date-based four-month limit, while `isDateBookableNow` models the documented 8:00 AM rule.
- **Scope**: Targeted refactor
- **Estimated effort**: Half day
- **Depends on**: none
- **Fix instructions**:
  1. Extract one shared helper that computes `bookingOpenAt` for a target date in `America/Denver`.
  2. Reimplement both `assertBookingWindow` and `isDateBookableNow` on top of that helper.
  3. Make time zone handling explicit instead of relying on host-local defaults.
  4. Update any user-facing errors to include the concrete opening timestamp.
- **How to verify**:
  - Add tests for `07:59` and `08:00` on the opening day in `America/Denver`.
  - Confirm both helpers agree on the same boundary.

#### F-005 — Normalize keychain account handling consistently
- **Severity**: 🟡 Warning
- **Location**: `src/keychain.ts:65-82`
- **What's wrong**: Reads normalize shorthand account names; writes and deletes do not.
- **Scope**: Patch
- **Estimated effort**: 1-2 hours
- **Depends on**: none
- **Fix instructions**:
  1. Reuse the same normalization rule for get/save/delete.
  2. Prefer one canonical account representation everywhere, ideally full email.
  3. Add migration compatibility so existing stored entries are still found if possible.
- **How to verify**:
  - Add tests for save/read/delete round-trips with shorthand and full-email inputs.

---

### Package 3: Test and Tooling Baseline
**Priority**: Do third, but start immediately after Package 1 if multiple people are available
**Estimated scope**: 2-4 days
**Rationale**: The repo already has good helper tests; this package extends that discipline to the modules that actually decide whether a release run works.

#### F-006 — Wire `npm test` to Jest
- **Severity**: 🟡 Warning
- **Location**: `package.json:21`
- **What's wrong**: The conventional test entry point always exits 1.
- **Scope**: Patch
- **Estimated effort**: 30 minutes
- **Depends on**: none
- **Fix instructions**:
  1. Replace the stub with `jest --runInBand` or an equivalent stable command.
  2. If desired, add `test:watch` separately rather than overloading `test`.
- **How to verify**:
  - Run `npm test` and confirm it passes with the current suite.

#### F-007 — Validate numeric race CLI inputs
- **Severity**: 🟡 Warning
- **Location**: `src/race.ts:110-117`
- **What's wrong**: Bad numeric input falls through into runtime behavior.
- **Scope**: Patch
- **Estimated effort**: 2-3 hours
- **Depends on**: Package 1 semantics settled
- **Fix instructions**:
  1. Add explicit validation for `concurrency`, `monitorInterval`, and `maxHolds`.
  2. Reject `NaN`, zero, negative, and nonsensical values with actionable error text.
  3. Apply the same pattern to similar parsing sites in `release.ts` and `site-availability.ts`.
- **How to verify**:
  - Add CLI-level unit tests for invalid numeric inputs.

#### F-008 — Add direct regression coverage for live workflow entry points
- **Severity**: 🟡 Warning
- **Location**: `src/race.ts`, `src/release.ts`, `src/automation.ts`, `src/index.ts`
- **What's wrong**: The modules that matter most in production have little or no direct test coverage.
- **Scope**: Structural change
- **Estimated effort**: 2-4 days
- **Depends on**: F-001, F-002, F-003, F-004, F-005, F-007
- **Fix instructions**:
  1. Introduce a test seam around ReserveAmerica responses and Playwright page behavior.
  2. Split pure decision logic from side-effectful browser/process code where needed.
  3. Add high-value regression tests first:
     - release wrapper prelaunch scout does not abort when exact-date availability is empty
     - cart parser recognizes all supported site IDs
     - monitoring mode renews the default account correctly
     - race CLI rejects invalid numerics
  4. Add at least one mocked end-to-end flow per entry point rather than aiming for full browser integration immediately.
- **How to verify**:
  - New tests fail on the current buggy behavior and pass after the fixes.
  - `npm test` runs them in CI-friendly mode.

---

### Package 4: Efficiency and Operational Hardening
**Priority**: After correctness and test baseline
**Estimated scope**: 1-2 days
**Rationale**: These are worthwhile, but they are not the first-order blockers for release reliability.

#### F-009 — Reduce arrival-sweep page refetching
- **Severity**: 🟡 Warning
- **Location**: `src/site-calendar.ts:512-532`
- **What's wrong**: Arrival sweeps fetch site details once per date, which scales poorly.
- **Scope**: Targeted refactor
- **Estimated effort**: Half day to 1 day
- **Depends on**: none
- **Fix instructions**:
  1. Reuse already-fetched site-calendar windows where possible.
  2. Cache by site/date window during one run so repeated dates do not trigger full refetches.
  3. Keep the current correctness-first behavior if no safe reuse path exists.
- **How to verify**:
  - Add a unit test or instrumentation-based test showing reduced fetch count for a sweep.

#### F-010 — Replace the final 200ms busy-spin
- **Severity**: 🟢 Improvement
- **Location**: `src/timer-utils.ts:25-41`
- **What's wrong**: Busy-spin wastes CPU during the hottest part of the launch flow.
- **Scope**: Patch
- **Estimated effort**: 1-2 hours
- **Depends on**: none
- **Fix instructions**:
  1. Replace the pure spin loop with a tighter sleep/poll cadence or a bounded hybrid that does not monopolize a core.
  2. Measure whether the replacement is precise enough for launch-time needs.
- **How to verify**:
  - Benchmark or log the fire-time delta under repeated runs.

---

## Target Architecture Proposals

### Architecture: Release-Day Target Selection

**Current approach and why it's problematic**:  
The wrapper’s default path treats prelaunch scouting as if exact-date bookable inventory should already be present. That conflicts with the product’s own operating model: before 8:00 AM, the wrapper should be freezing *candidates*, not demanding already-open release inventory.

```ts
// Current
const liveSites = loadedSiteList
  ? search.exactDateMatches.map((site) => site.site).filter(...)
  : search.exactDateMatches.map((site) => site.site);
if (selectedSites.length === 0) {
  throw new Error(`No exact-date ${loop} sites were available...`);
}
```

**Target approach**:  
Treat the wrapper as a planner. Before launch, it should rank and freeze a candidate shortlist from site lists, snapshots, and broader scouting signals. At launch, `race.ts` should discover the real exact-date openings and compete for them.

```ts
// Target
const candidateSites = rankRequestedSitesForCapture(
  explicitSites.length > 0 ? explicitSites : loadedSiteList?.siteIds ?? snapshotOrScoutSites,
  availabilitySnapshot,
  loadedSiteList,
);
return selectReleaseSites(candidateSites, desiredCount);
```

**Migration path**:
1. Introduce a “candidate shortlist” concept in `release.ts` that is independent of exact-date availability.
2. Keep projection mode as one candidate-source implementation.
3. Convert the default scout path to produce the same shortlist shape.
4. Only let `race.ts` decide which sites are truly available at launch.

**Files to change**: `src/release.ts`, `src/release-utils.ts`, possibly `README.md`
**Adopt project-wide**: Yes — prelaunch planning should never require already-open release inventory.

### Architecture: Site ID Contract

**Current approach and why it's problematic**:  
Site IDs are treated as generic strings in many places, but parsing boundaries hard-code `BH##`. That creates drift between configuration, detection, and cart verification.

```ts
// Current
const SITE_TOKEN_PATTERN = /\bBH\d{2}(?:-HOST)?\b/i;
return (bodyText.match(/BH\d{2}/g) ?? []);
```

**Target approach**:  
Create one shared site-ID parser/normalizer and use it everywhere the code reads site IDs from text, markdown, HTML, or logs.

```ts
// Target
export function extractSiteIds(text: string): string[] { ... }
export function isValidSiteId(value: string): boolean { ... }
export function normalizeSiteId(value: string): string { ... }
```

**Migration path**:
1. Add a dedicated `src/site-id.ts`.
2. Move list parsing and cart extraction onto the shared helpers.
3. Update tests to encode the supported site families.
4. Remove local regex duplicates.

**Files to change**: `src/site-lists.ts`, `src/cart-detection.ts`, likely `src/account-booker.ts`, tests
**Adopt project-wide**: Yes — no new code should parse site IDs ad hoc.

### Architecture: Entry-Point Testability

**Current approach and why it's problematic**:  
The riskiest modules mix CLI parsing, business decisions, browser control, and process spawning. That makes them hard to regression-test.

**Target approach**:  
Extract pure planning/decision functions from the side-effectful entry points and test those directly. Keep thin CLI wrappers around them.

```ts
// Target pattern
export function planReleaseRun(input: ReleaseInputs, deps: ScoutResults): ReleasePlan { ... }
export async function executeReleasePlan(plan: ReleasePlan): Promise<number> { ... }
```

**Migration path**:
1. Start with `release.ts` and `index.ts`, since they have the clearest decision boundaries.
2. Extract small pure helpers from `race.ts` rather than trying to rewrite the whole file at once.
3. Mock Playwright and ReserveAmerica dependencies in tests around the extracted planners.

**Files to change**: `src/release.ts`, `src/race.ts`, `src/index.ts`, `src/automation.ts`, new tests
**Adopt project-wide**: Yes — new workflow logic should be testable without a live browser.

---

## What's Not Covered by This Plan

All audited feature areas are covered by this plan.

| Area | Audit status | Health | Plan status |
|------|-------------|--------|-------------|
| Standard Monitoring & Polling | Audited | 🟡 | Planned |
| Availability Search & Site Reports | Audited | 🟡 | Planned |
| Automated Race Capture | Audited | 🔴 | Planned |
| Scheduled Release Wrapper | Audited | 🔴 | Planned |
| Multi-Account Session & Cart Operations | Audited | 🟡 | Planned |
| Notifications & Debugging | Audited | 🟢 | Planned, low priority |
| Infrastructure / Cross-cutting | Audited | 🟡 | Planned |
| Security | Audited | 🟢 | No remediation required beyond normal hygiene |

---

## Recommended Execution Order

**Day 1**: Fix F-001 and F-002. Those are the two product-level correctness bugs that directly threaten release-day success. Also land F-006 the same day because it is trivial and improves every subsequent change.

**Week 1**: Finish F-003, F-004, F-005, and F-007. These align session behavior, booking-window semantics, and CLI contracts so the repo stops lying to the operator.

**Week 2+**: Land F-008 as the main structural investment, then pick up F-009 and F-010 as cleanup/hardening once the corrected behaviors are under regression coverage.

**Before any new feature work**:
- F-001 release wrapper scouting fix
- F-002 site ID contract fix
- F-006 real `npm test`
- At least the first tranche of F-008 regression tests

---

## Success Criteria

- Package 1 complete when: the wrapper can run before 8:00 AM without requiring exact-date openings, and mixed valid site IDs pass through site-list parsing and cart verification correctly.
- Package 2 complete when: monitoring renews the default account correctly, booking-window helpers agree on the same `America/Denver` opening timestamp, and keychain save/read/delete round-trip with canonical account IDs.
- Package 3 complete when: `npm test` runs the suite, high-risk entry points have direct regression coverage, and the current critical bugs are locked by tests.
- Package 4 complete when: arrival sweeps reuse/collapse redundant fetches and launch timing no longer busy-spins a core.
- Overall remediation complete when: all critical findings are resolved, warning-level correctness issues are fixed or consciously deferred with tests, and release-day behavior is covered by repeatable automated checks.
