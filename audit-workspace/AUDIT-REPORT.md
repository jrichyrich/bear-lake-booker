# Code Audit Report
**Date**: 2026-03-11
**Project**: Bear Lake Booker (`/Users/jasricha/Documents/Github_Personal/bear-lake-booker`)
**Audit team**: Orchestrator + 6 chunk reviews + security scan + synthesis

---

## Executive Summary

Bear Lake Booker is a functional TypeScript CLI for Bear Lake reservation monitoring and high-speed ReserveAmerica cart holds. The parser and coordination helpers are in better shape than the old audit artifacts suggested: TypeScript is clean, 92 Jest tests pass, and the helper modules are mostly coherent. The real problems are product-level correctness gaps in the live workflow: the default `release.ts` scout logic can reject the exact release-window run it exists to automate, and site-code handling is hard-coded to `BH##` in places that directly affect allowlists and cart verification. This project is salvageable as-is, but it is not yet trustworthy for the primary “8:00 AM release wrapper” workflow without narrowing those gaps first.

**Overall Health**: 🔴 Critical

---

## What This Project Does

This repository automates Bear Lake campsite discovery and races to place cart holds through ReserveAmerica. It supports low-overhead HTTP monitoring, per-site availability reporting, scheduled release runs, multi-account browser capture, and manual checkout handoff after a hold lands.

## Feature Map

| Feature | Chunks | Risk | Health |
|---------|--------|------|--------|
| Standard Monitoring & Polling | Monitoring, Notifications & Ops Utilities; Availability Data & Reports; Auth & Session Management | Medium | 🟡 |
| Availability Search & Site Reports | Availability Data & Reports | Medium | 🟡 |
| Automated Race Capture | Race Orchestration; Browser Automation & Cart Handling; Auth & Session Management | High | 🔴 |
| Scheduled Release Wrapper | Release Wrapper & Projection; Availability Data & Reports; Auth & Session Management; Race Orchestration | High | 🔴 |
| Multi-Account Session & Cart Operations | Auth & Session Management; Browser Automation & Cart Handling | Medium | 🟡 |
| Notifications & Debugging | Monitoring, Notifications & Ops Utilities | Low | 🟢 |
| Infrastructure / Cross-cutting | Race Orchestration; Monitoring, Notifications & Ops Utilities | Medium | 🟡 |

## Findings Register

### 🔴 Critical — Fix Before This Ships

| # | Source | Location | Issue | Impact |
|---|--------|----------|-------|--------|
| 1 | release-wrapper | `src/release.ts:199` | Pre-launch scout only accepts exact-date matches | The release wrapper can abort before the release window opens, which breaks the product’s main use case |
| 2 | availability/browser | `src/site-lists.ts:5`, `src/cart-detection.ts:22` | Site-code handling is hard-coded to `BH##` | Valid site IDs outside that prefix are rejected in allowlists or missed during cart verification |

**Finding #1 — Release wrapper scouts the wrong thing**
The default `release.ts` path waits until scout time and then calls `searchAvailability(...)`, but it only keeps `search.exactDateMatches` when building the launch target list. On the real window-edge release morning, scout time is before 8:00 AM, so exact-date availability is expected to be empty until launch. The result is a thrown error at `src/release.ts:217-218` before the race even starts. The projection path is closer to the intended behavior, but the default branch remains wrong for the repo’s north-star workflow.

**Finding #2 — Site ID assumptions leak across the workflow**
The repo treats site IDs as free-form strings in most places, but two important boundaries do not. `src/site-lists.ts:5` only accepts `BH##` tokens in ranked site lists, and `src/cart-detection.ts:22-25` only extracts `BH##` IDs from cart HTML. A quick runtime probe confirmed that `extractCartSiteIds('BC85\nBH03\nBC86')` returns only `["BH03"]`, and `parseRankedSiteList('## Top choices\n- BC85\n')` throws. This is a systemic bug: it can prevent valid sites from being configured and can cause cart preflight/success verification to miss real holds.

### 🟡 Warning — Fix Before Next Release

| # | Source | Location | Issue |
|---|--------|----------|-------|
| 1 | auth-session | `src/keychain.ts:65-82` | Account normalization differs between credential reads and writes |
| 2 | monitoring | `src/index.ts:42-45`, `src/auth.ts:135-141` | Expired default-session auto-login path is effectively a no-op |
| 3 | ops/utilities | `src/timer-utils.ts:50-68` | Booking-window assertion ignores the documented 8:00 AM gate |
| 4 | cross-cutting | `package.json:21` | `npm test` is broken even though the Jest suite is healthy |
| 5 | race/browser/release | `src/race.ts`, `src/automation.ts`, `src/release.ts` | Highest-risk live workflows have no direct automated coverage |
| 6 | race-orchestration | `src/race.ts:110-117` | Numeric CLI inputs are parsed but not validated |
| 7 | availability-data | `src/site-calendar.ts:512-532` | Arrival sweeps refetch site pages one date at a time |

### 🟢 Improvements — When You Have Capacity

| # | Area | Observation |
|---|------|------------|
| 1 | notifications | macOS-only by design; acceptable for a personal tool but not portable |
| 2 | parser resilience | HTML parser failures are visible and debug-friendly, but selectors are still brittle |
| 3 | timing | final 200ms busy-spin is a small but avoidable CPU spike |

### 💀 Dead Weight — Safe to Remove

| Item | Why unused |
|------|-----------|
| None confirmed | No clear dead files or stubs were found in tracked source |

## Chunk Health Summary

| Chunk | Status | Runtime Result | Key Finding |
|-------|--------|---------------|-------------|
| Availability Data & Reports | 🟡 | Tests: 33/33 passed | Ranked site lists are hard-coded to `BH##` |
| Race Orchestration | 🟡 | Tests: 20/20 passed | `race.ts` itself is largely untested and trusts parsed numerics |
| Browser Automation & Cart Handling | 🔴 | Tests: 13/13 passed | Cart parsing only recognizes `BH##` site IDs |
| Auth & Session Management | 🟡 | Tests: 1/1 passed | Keychain read/write normalization is inconsistent |
| Release Wrapper & Projection | 🔴 | Tests: 14/14 passed | Default scout logic conflicts with the release-window use case |
| Monitoring, Notifications & Ops Utilities | 🟡 | Tests: 11/11 passed | Booking-window assertion ignores the 8:00 AM threshold |

## Security Summary

The tracked repository does not currently show exploitable web-app style security flaws. There are no committed secrets in tracked source, no dependency vulnerabilities from `npm audit`, and no meaningful injection or auth-bypass surface because this is a local CLI driving a third-party site rather than serving requests. Session handling is intentionally sensitive but reasonably careful: `.sessions/` is permission-hardened and login validity is checked against a protected ReserveAmerica page rather than trusting cookie metadata alone.

**Auth assessment**: Local-session model is reasonable for a CLI, with correctness risks but no critical security flaw found  
**Injection risk**: No meaningful injection surface found in tracked source  
**Secrets exposure**: No committed secrets detected in tracked source  
**Dependency vulns**: 0 reported by `npm audit`

## Cross-Cutting Issues

### Systemic Patterns
The biggest systemic issue is business assumptions leaking across chunks. Site IDs are treated as generic strings in many modules but constrained to `BH##` in others, and release-window timing is documented precisely in one helper while ignored in another. These are not isolated bugs; they are cross-chunk assumption mismatches.

### Dead Code
No clear dead code or abandoned scaffolding was confirmed.

### Test Coverage
Coverage is better than it first appears: 92 Jest tests pass and the helper-heavy modules are exercised. The gap is that the code with the most operational risk (`race.ts`, `release.ts`, `automation.ts`, `index.ts`, `timer-utils.ts`) has little or no direct test coverage, so regressions will surface in live runs.

### Interface Integrity
The interfaces between helpers are typed and mostly coherent. The main integrity failures come from product semantics: one chunk says “this date is bookable” by date-only logic while another correctly models the 8:00 AM opening threshold, and cart/site-list code disagrees about what a valid site identifier looks like.

## Vibe-Code Assessment

This codebase does not read like pure throwaway AI scaffolding. The coordination helpers, parser tests, and session utilities show real iteration and operational knowledge. The suspect parts are the large workflow entry points where product assumptions were changed over time without fully reconciling the old and new paths, especially around release scouting and site-code handling.

**Coherent and intentional**: `src/account-booker.ts`, `src/site-targeting.ts`, `src/session-utils.ts`, parser/reporting helpers  
**Suspect**: `src/release.ts`, `src/automation.ts`, `src/race.ts` entry-point branching  
**Verdict**: Salvageable as-is

## Overall Verdict

This is not a broken repo. It has real strengths: typed helpers, strong parser/unit coverage, and a sensible multi-account coordination model. But the live release workflow still contains logic that can contradict the product’s own mission, and the site-ID assumption bug is broad enough to affect both targeting and cart verification. Fix those first, then add direct tests around the real browser/release paths before trusting the wrapper on a high-stakes release morning.
