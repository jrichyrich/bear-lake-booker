# Multi-Agent Plan

## Goal
Run multiple Playwright agents in parallel for the capture step while keeping the flow stable, inspectable, and limited to the safe boundary at `Order Details`.

## Current State
- `src/index.ts` uses direct HTTP monitoring for exact-date availability.
- `src/race.ts` launches multiple Playwright contexts after an exact-date hit.
- The capture path can:
  - resolve a site from the results table,
  - open site details with `arvdate` and `lengthOfStay` preloaded,
  - stop at site details with `--dryRun`,
  - stop at `Order Details` with `--book`.
- `session.json` exists locally and is used for authenticated Playwright runs.

## Recommended Architecture
### 1. Monitoring stays HTTP-only
- Keep the cheap polling path in `src/index.ts` and `src/reserveamerica.ts`.
- Only launch browsers when there is an exact-date match.

### 2. Capture agents use persistent Playwright profiles
- Replace ephemeral `browser.newContext(...)` fan-out with one persistent browser profile per agent.
- Suggested profile directory layout:
  - `profiles/agent-1`
  - `profiles/agent-2`
  - `profiles/agent-3`
  - ...
- Use `chromium.launchPersistentContext(profileDir, ...)` so each agent has isolated cookies, cache, local storage, and history.

### 3. Single target, many watchers
- All agents can monitor the same site/date target after an exact hit.
- Only one agent should be allowed to claim success and stop the rest.
- Keep the shared `isSuccess` gate, but add explicit cancellation so other agents exit quickly once one reaches `Order Details`.

### 4. Safe capture boundary remains `Order Details`
- Do not automate `Review Cart`, `Checkout`, or payment in the parallel rollout.
- `--book` should keep meaning "hold the site and stop at `Order Details`."

## Implementation Phases
### Phase 1: Profile-backed agents
- Add a `profiles/` directory and ignore it in `.gitignore`.
- Create one persistent profile directory per agent.
- Add a startup mode to hydrate a profile from `session.json` if the profile is empty.
- Preserve per-agent `userAgent` and timezone settings.

### Phase 2: Agent orchestration
- Extract race orchestration from `src/race.ts` into smaller helpers:
  - `createAgentProfile()`
  - `launchAgentContext()`
  - `runCaptureAgent()`
  - `cancelRemainingAgents()`
- Give each agent its own log prefix and optional screenshot path.
- Add a shared success payload:
  - agent id
  - site id
  - site loop
  - arrival date
  - final page URL

### Phase 3: Booking ownership
- Add a strict ownership rule:
  - first agent to reach `Order Details` wins,
  - all others immediately close.
- Add a small lock file or in-process winner state so the decision is explicit.
- Prevent duplicate notifications once a winner exists.

### Phase 4: Resume-friendly observability
- Add per-agent logs under `logs/`.
- Add per-agent screenshots on:
  - results page,
  - site details page,
  - `Order Details`,
  - error.
- Write a short session summary file after each run:
  - target date
  - loop
  - agent count
  - winning agent
  - winning site
  - timestamp

## Configuration Plan
Add these CLI options to `src/race.ts`:
- `--profileMode persistent|ephemeral`
- `--profileDir <path>`
- `--winnerTtl <seconds>`
- `--headedWinnerOnly`
- `--screenshotOnWin`

Recommended defaults:
- `profileMode=persistent`
- `profileDir=profiles`
- `headedWinnerOnly=false`

## Risks
### Session reuse risk
- Some sites invalidate or mutate session state when many browser contexts reuse the same account.
- Mitigation:
  - start with `c=2` or `c=3`,
  - verify the account stays logged in,
  - then scale upward.

### Cart collision risk
- Multiple agents may try to hold different sites at the same time.
- Mitigation:
  - cancel all non-winning agents immediately after the first `Order Details` hit.

### Profile drift
- Persistent profiles can accumulate stale state.
- Mitigation:
  - add a reset command for a single agent profile,
  - keep `session.json` as the canonical login source.

## Recommended Rollout
1. Implement persistent profiles with `c=1` and verify no behavior change.
2. Run `c=2` on a known available date in `--dryRun`.
3. Run `c=2` with `--book` and verify only one agent reaches `Order Details`.
4. Increase to `c=4`.
5. Increase to `c=10` only after the winner/cancellation path is stable.

## Exact Next Steps
1. Add `profiles/` to `.gitignore`.
2. Refactor `src/race.ts` to support `launchPersistentContext`.
3. Add winner cancellation logic.
4. Add per-agent logs and screenshots.
5. Test with:
   - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 2 --dryRun`
   - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 2 --book --headed`

## Resume Notes
- Last verified safe live run:
  - `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 1 --dryRun`
- Observed result:
  - exact-date openings were detected,
  - agent opened `BH09` via `See Details`,
  - flow stopped at site details as expected.
- Last verified capture boundary:
  - request capture confirmed `switchBookingAction.do` is the transition into `Order Details`.
