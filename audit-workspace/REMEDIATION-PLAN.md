# Remediation Plan: Bear Lake Booker

Based on the full code audit, this plan outlines the necessary steps to move the project from "stable" to "enterprise-grade" in terms of maintainability and resiliency.

## 1. Automated Testing (Protecting Logic)
The project lacks a safety net for future website changes.
- **Goal**: Add unit tests for the HTML parser using mock HTML snapshots.
- **Scope**: `src/reserveamerica.ts`
- **Tasks**:
  - Install `jest` and `ts-jest`.
  - Create `tests/parser.test.ts`.
  - Save 3-4 HTML snapshots of different calendar states (all available, some held, none available).
  - Assert that `parseSearchResult` returns the expected objects.
- **Estimate**: 1 hour.

## 2. Refactor Race Mode (Maintainability)
`src/race.ts` is growing too complex for a single file.
- **Goal**: Extract browser-specific automation logic into dedicated helpers.
- **Scope**: `src/race.ts` -> `src/automation.ts`
- **Tasks**:
  - Move `primeSearchForm`, `ensureLoggedIn`, and `prepareOrderDetails` to a new `src/automation.ts` file.
  - Leave `src/race.ts` as the "Orchestrator" that only handles multi-agent coordination.
- **Estimate**: 45 mins.

## 3. Network Resiliency (Stability)
The tool currently fails immediately on transient network errors.
- **Goal**: Add simple retry logic with exponential backoff to the API wrapper.
- **Scope**: `src/reserveamerica.ts`
- **Tasks**:
  - Implement a `fetchWithRetry` wrapper.
  - Configure it to retry 3 times on 5xx errors or timeouts.
  - Add a 1s -> 2s -> 4s backoff.
- **Estimate**: 30 mins.

## 4. Parser Observability (Debugging)
When the parser fails (due to a ReserveAmerica update), it currently fails silently.
- **Goal**: Log raw HTML to a file when a critical selector is missing.
- **Scope**: `src/reserveamerica.ts`, `src/race.ts`
- **Tasks**:
  - In `parseSearchResult`, if the `#calendar` is not found, write the raw HTML to `logs/debug-[timestamp].html` before throwing.
  - Add a `--verbose` flag to CLI to enable this globally.
- **Estimate**: 30 mins.

---

## Target Architecture Proposal
Move from a "flat" structure to a layered one:
- **Core**: `src/reserveamerica.ts` (Raw API)
- **Service**: `src/automation.ts` (Playwright primitives)
- **Entry**: `src/index.ts`, `src/race.ts` (CLI/Loops)
- **Infra**: `src/keychain.ts`, `src/config.ts`

## Recommended First Action
Implement **Item 1 (Automated Testing)**. This is the most important step to ensure that any future refactoring (Item 2) or resiliency updates (Item 3) don't accidentally break the core availability detection logic.
