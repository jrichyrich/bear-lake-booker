# Bear Lake Booker

Bear Lake Booker is a TypeScript CLI for monitoring Bear Lake State Park availability and racing to place a cart hold through ReserveAmerica. It combines lightweight HTTP polling with Playwright-based capture flows for high-contention releases and cancellation pickups.

## Current Capabilities
- Exact-date HTTP monitoring for a target arrival date and stay length.
- Hybrid race mode that polls first, then launches Playwright agents on a hit.
- Scheduled race mode for release-window starts.
- Persistent Playwright profiles, per-agent logs, screenshots, and structured run summaries.
- Multi-account session support using `.sessions/session-*.json`.
- `bookingMode=single` and `bookingMode=multi` capture coordination.
- Manual-safe boundary at cart hold / `Order Details`; final checkout and payment stay manual.

## Main Entry Points
- `src/index.ts`: low-overhead monitoring.
- `src/race.ts`: hybrid and scheduled capture.
- `src/release.ts`: release/rehearsal wrapper that freezes targets and starts `race.ts` at an arbitrary launch time.
- `src/auth.ts`: manual login and session file creation/renewal.
- `src/view-cart.ts`: open shopping carts for one or more accounts after a hold.
- `src/inspect.ts`: inspect ReserveAmerica traffic when the flow changes.

## Setup
### Prerequisites
- Node.js and npm.
- Playwright browsers: `npx playwright install`
- ReserveAmerica credentials stored in keychain if you want auto-fill / auto-login helpers: `npm run setup-keychain`

### Install
```bash
npm install
npx playwright install
```

## Session Model
Sessions are stored under `.sessions/`.

- Default account: `.sessions/session.json`
- Named account: `.sessions/session-<account-prefix>.json`

Examples:
- `npm run auth`
- `npm run auth -- --user lisa@gmail.com`
- `npm run auth -- --user lisa@gmail.com,jason@gmail.com`

`race.ts` and `view-cart.ts` can validate and renew sessions when needed, but the operationally safe pattern is still to authenticate before a live run.

Optional iMessage recipients live in `.sessions/notification-recipients.json`:

```json
{
  "test": {
    "imessageRecipients": ["+18015551212"]
  },
  "production": {
    "imessageRecipients": ["+18015559876", "+18015557654"]
  }
}
```

If present, `race.ts` sends one end-of-run inventory summary to each configured recipient in the selected profile when at least one hold is secured. Rehearsals should use `--notificationProfile test`; live release runs should use `--notificationProfile production`.

## Common Commands
### Monitoring
- Standard check: `npm start -- -d 08/15/2026 -l 3 -o BIRCH`
- Continuous monitor: `npm start -- -d 08/15/2026 -l 3 -o BIRCH -i 5`

### Capture
- Hybrid dry run: `npm run race -- -d 08/15/2026 -l 3 -o BIRCH -m 5 -c 2 --dryRun --headed`
- Hybrid live hold attempt: `npm run race -- -d 08/15/2026 -l 3 -o BIRCH -m 5 -c 4 --book`
- Scheduled race with targeted sites: `npm run race -- -d 08/15/2026 -l 3 -o BIRCH -c 10 -t 07:59:59 --sites BH09,BH11 --book --notificationProfile production`
- Release/rehearsal wrapper: `npm run release -- --launchTime 07:59:59 -d 08/15/2026 -l 3 -o BIRCH -c 6 --book --accounts lisa@gmail.com,jason@gmail.com --headed --checkoutAuthMode manual --notificationProfile test`
- Multi-account run: `npm run race -- -d 08/15/2026 -l 3 -o BIRCH -c 4 --book --accounts lisa@gmail.com,jason@gmail.com`
- Multi-hold mode: `npm run race -- -d 08/15/2026 -l 3 -o BIRCH -c 4 --book --bookingMode multi --maxHolds 2 --accounts lisa@gmail.com,jason@gmail.com`

### Cart and Session Utilities
- View default cart: `npm run view-cart`
- View multiple carts: `npm run view-cart -- --accounts lisa@gmail.com,jason@gmail.com`
- Test session behavior: `npm run test-session`
- Find an open date: `npm run find-open`

### Validation
- Type check: `npx tsc --noEmit`
- Tests: `npx jest --runInBand`

## Capture Notes
`src/race.ts` supports these important flags:

- `--book`: continue to `Order Details` and stop there.
- `--dryRun`: never place a hold.
- `--accounts <csv>`: spread capture across multiple authenticated accounts.
- `--bookingMode single|multi`: choose single-winner or multi-hold coordination.
- `--maxHolds <n>`: cap holds in multi mode.
- `--sites <csv>`: restrict capture to explicit site IDs.
- `--headed`: run visible browsers for debugging or manual intervention.
- `--checkoutAuthMode auto|manual`: choose how checkout re-auth is handled.
- `--notificationProfile test|production`: choose which iMessage recipient profile gets the final inventory summary.

`src/release.ts` adds wrapper-only scheduling flags:

- `--launchTime <HH:MM:SS>`: required launch time for today.
- `--scoutLeadMinutes <mins>`: when to freeze the scout target set before launch.
- `--warmupLeadSeconds <secs>`: when to start `race.ts` warm-up before launch.

## Safe Boundary
The automation boundary is still intentional: Bear Lake Booker can reach the shopping cart hold state, but it does not complete checkout or payment. ReserveAmerica may still require a CAPTCHA or checkout login during capture, so the live workflow is:

1. Authenticate the account or accounts with `npm run auth`.
2. Run monitoring or `npm run race`.
3. If a hold lands, open the cart with `npm run view-cart`.
4. Complete checkout manually before the hold expires.

For `npm run release`, the wrapper also requires empty carts before launch, scouts or freezes the target site list, and then starts `race.ts` with the resolved `--time` and `--sites`.

## Roadmap
The main unfinished work is tracked in:

- [`BACKLOG.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/BACKLOG.md)
- [`docs/NORTH_STAR.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/NORTH_STAR.md)
- [`docs/PHASE1_RUNBOOK.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/PHASE1_RUNBOOK.md)
- [`docs/PHASE1_RESULTS.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/PHASE1_RESULTS.md)
- [`docs/ARCHITECTURE_ROADMAP.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/ARCHITECTURE_ROADMAP.md)

Current roadmap priorities are:
- validate the release-day workflow for 2 accounts at the 8:00 AM window
- harden and document live `bookingMode=multi`
- improve scout discovery and target-site selection before launch
- improve multi-account coordination for up to 6 holds
- expand proactive session renewal
- add cross-platform push notifications

Broader features like `--dateRange` scanning and a watchdog daemon are still useful, but they are secondary to the release-window flow described in [`docs/NORTH_STAR.md`](/Users/lisarichards/.codex/worktrees/b5d4/bear-lake-booker/docs/NORTH_STAR.md).
