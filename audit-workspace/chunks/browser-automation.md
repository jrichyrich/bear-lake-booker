# Chunk Audit: Browser Automation & Cart Handling

**User-facing feature**: Automated booking, order-details transitions, cart verification
**Risk Level**: High
**Files Audited**: `src/automation.ts`, `src/cart-detection.ts`, `src/checkout-auth.ts`
**Status**: Complete

## Purpose (as understood from reading the code)
This chunk is the Playwright layer that drives the ReserveAmerica UI. It primes the search form, chooses live candidates, navigates to site/order-details pages, attempts cart placement, and decides whether the cart attempt really succeeded.

## Runtime Probe Results
- **Tests found**: Yes
- **Tests run**: 13 passed, 0 failed (`cart-detection`, `checkout-auth`)
- **Import/load check**: Covered indirectly by Jest and `npx tsc --noEmit`
- **Type check**: OK
- **Edge case probes**: `extractCartSiteIds('BC85\nBH03\nBC86')` returned `["BH03"]`
- **Key observation**: The cart parser only recognizes `BH##` site IDs, so cart verification is narrower than the rest of the automation flow.

## Dimension Assessments

### Implemented
The browser flow is substantive. Search warm-up, login recovery, cart inspection, and add-to-cart attempts all have real code paths and debug artifact capture.

### Correct
`src/cart-detection.ts:22-25` only extracts `BH##` site IDs from cart HTML. If ReserveAmerica returns valid Bear Lake site IDs outside that prefix, preflight cart checks and post-booking verification will miss them.

### Efficient
The chunk is network-bound and UI-bound; the main issue is correctness, not computational waste.

### Robust
The code captures screenshots/HTML on failure, which is good. The downside is heavy dependence on brittle selectors in `src/automation.ts` for a legacy third-party UI with no contract.

### Architecture
`src/automation.ts` is doing several jobs at once: login recovery, form automation, cart inspection, and success heuristics. The module is workable but difficult to reason about and not directly unit-tested.

## Findings

### 🔴 Critical
- **[src/cart-detection.ts:22]** — Cart parsing is hard-coded to `BH##` site IDs — Cart preflight and success verification can silently miss valid non-`BH` site codes, which means the live run can start with a non-empty cart or misclassify a successful hold.

### 🟡 Warning
- **[src/automation.ts]** — The high-value browser flow has no direct automated tests — The small helper tests do not validate the actual Playwright interaction path.
- **[src/automation.ts:270-389]** — Candidate discovery depends on ReserveAmerica DOM selectors and action labels — This is operationally fragile even though the failure mode is at least visible.

### 🟢 Note
- Checkout-auth fallback logic is more robust than the rest of the browser layer and has direct test coverage.
