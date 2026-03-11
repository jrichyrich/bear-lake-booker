# Chunk Audit: Auth & Session Management

**User-facing feature**: Manual auth, auto-login, session renewal, cart viewing
**Risk Level**: Medium
**Files Audited**: `src/auth.ts`, `src/session-utils.ts`, `src/session-manager.ts`, `src/keychain.ts`, `src/setup-keychain.ts`, `src/check-session.ts`, `src/view-cart.ts`
**Status**: Complete

## Purpose (as understood from reading the code)
This chunk manages how accounts authenticate and how session state is stored and reused. It handles keychain credentials, session JSON files, session validation, manual renewal, and cart viewing.

## Runtime Probe Results
- **Tests found**: Yes
- **Tests run**: 1 passed, 0 failed (`session-utils`)
- **Import/load check**: Covered indirectly by Jest and `npx tsc --noEmit`
- **Type check**: OK
- **Edge case probes**: No side-effectful probes were run against Keychain/Playwright login code.
- **Key observation**: Session utilities are covered, but the actual auth/login entry points are mostly untested and contain one concrete account-normalization mismatch.

## Dimension Assessments

### Implemented
Manual and automated login flows exist, session files are permission-hardened, and cart viewing reuses the same session model.

### Correct
`src/keychain.ts:65-82` normalizes short account names on read (`lisa` -> `lisa@gmail.com`) but not on save/delete. That means a shorthand value can be stored under one key and later looked up under another.

### Efficient
No material efficiency problems were found. Most work is dominated by Playwright/browser startup rather than local computation.

### Robust
`src/session-utils.ts` is reasonably defensive. The weaker spots are cross-module assumptions, such as callers expecting `performAutoLogin` to renew the default account even when they pass an empty account list.

### Architecture
The auth/session layer is coherent. The main issue is inconsistent normalization boundaries between CLI parsing, keychain storage, and auto-login callers.

## Findings

### 🔴 Critical
- None.

### 🟡 Warning
- **[src/keychain.ts:65]** — Keychain reads normalize shorthand accounts but writes do not — Credentials saved under a short alias can become unreadable to the login path.
- **[src/index.ts:42]** — Monitoring mode calls `performAutoLogin([])` for an expired default session — That code path logs an auto-renewal attempt but iterates zero accounts, so it renews nothing.

### 🟢 Note
- `src/session-utils.ts` is one of the more careful modules in the repository.
