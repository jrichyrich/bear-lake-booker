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
- `src/availability.ts`: full-loop HTTP availability search across all loop result pages.
- `src/site-availability.ts`: per-site calendar crawl with monthly range summaries.
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

### CLI Setup
The repo exposes a top-level CLI named `bear-lake`.

For local use without installing it into your shell:

```bash
npm run cli -- help
```

To install the command from this checkout:

```bash
npm link
bear-lake help
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

If present, `race.ts` sends one end-of-run inventory summary to each configured recipient in the selected profile when at least one hold is secured. Rehearsals should use `--notificationProfile test`; live booking runs should use `--notificationProfile production`.

## Common Commands
### Guided Workflow
- Show the simplified flow and loaded defaults: `bear-lake help`
- Morning scout for a 14-night target date: `bear-lake scout --date 07/11/2026 --length 14`
- Morning scout with the website-style stay-window matrix: `bear-lake scout --date 07/11/2026 --length 14 --showMatrix`
- Preflight the latest scout shortlist before 8 AM: `bear-lake prep --date 07/11/2026 --length 14`
- Preflight two accounts in parallel: `bear-lake prep --date 07/11/2026 --length 14 --accounts lisa@gmail.com,jason@gmail.com --parallelAccounts`
- Validate the scout-to-book handoff with a near-term dry run: `bear-lake validate --date 07/11/2026 --length 14`
- Rehearse the direct race flow from the latest exact-fit scout snapshot: `bear-lake rehearse --date 07/11/2026 --length 14`
- 8 AM booking run from the latest matching scout shortlist: `bear-lake book --date 07/11/2026 --length 14`
- Guided booking defaults to session-only preflight. Add `--cartPreflight` if you want the stricter empty-cart check before launch.

If you do not want to `npm link`, the same commands work as `npm run cli -- <command> ...`.

Optional defaults can live in `bear-lake-workflow.json`. Start from [`bear-lake-workflow.example.json`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/bear-lake-workflow.example.json).

### Monitoring
- Standard check: `npm start -- -d 08/15/2026 -l 3 -o BIRCH`
- Continuous monitor: `npm start -- -d 08/15/2026 -l 3 -o BIRCH -i 5`

### Capture
- Hybrid dry run: `npm run race -- -d 08/15/2026 -l 3 -o BIRCH -m 5 -c 2 --dryRun --headed`
- Hybrid live hold attempt: `npm run race -- -d 08/15/2026 -l 3 -o BIRCH -m 5 -c 4 --book`
- Scheduled race with targeted sites: `npm run race -- -d 08/15/2026 -l 3 -o BIRCH -c 10 -t 07:59:59 --sites BH09,BH11 --book --notificationProfile production`
- Scheduled race from a ranked site list: `npm run race -- -d 08/15/2026 -l 3 -o BIRCH -c 10 -t 07:59:59 --siteList preferred-sites --book --notificationProfile production`
- Booking/rehearsal wrapper: `npm run book -- --launchTime 07:59:59 -d 08/15/2026 -l 3 -o BIRCH -c 6 --book --accounts lisa@gmail.com,jason@gmail.com --headed --checkoutAuthMode manual --notificationProfile test`
- Booking wrapper from a ranked site list: `npm run book -- --launchTime 07:59:59 -d 08/15/2026 -l 3 -o BIRCH -c 6 --book --accounts lisa@gmail.com,jason@gmail.com --siteList preferred-sites --headed --checkoutAuthMode manual --notificationProfile test`
- Booking-day projection wrapper: `npm run book -- --launchTime 07:59:59 -d 07/15/2026 -l 14 -o BIRCH -c 6 --book --accounts lisa@gmail.com,jason@gmail.com --siteList preferred-sites --projectionMode window-edge --headed --checkoutAuthMode manual --notificationProfile test`
- Multi-account run: `npm run race -- -d 08/15/2026 -l 3 -o BIRCH -c 4 --book --accounts lisa@gmail.com,jason@gmail.com`
- Multi-hold mode: `npm run race -- -d 08/15/2026 -l 3 -o BIRCH -c 4 --book --bookingMode multi --maxHolds 2 --accounts lisa@gmail.com,jason@gmail.com`

### Cart and Session Utilities
- View default cart: `npm run view-cart`
- View multiple carts: `npm run view-cart -- --accounts lisa@gmail.com,jason@gmail.com`
- Test session behavior: `npm run test-session`
- Find an open date: `npm run find-open`
- Full-loop preferred-site search: `npm run availability -- --dateFrom 07/22/2026 --dateTo 07/27/2026 -l 1 -o BIRCH --siteList preferred-sites`
- Monthly per-site range report: `npm run site-availability -- --dateFrom 07/01/2026 --dateTo 07/31/2026 -l 1 -o BIRCH --siteList preferred-sites --concurrency 4 --out "camp sites/availability/site-availability-2026-07.md"`

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
- `--siteList <name-or-path>`: load ranked allowed sites from `camp sites/<name>.md` or a path.
- `--availabilitySnapshot <path>`: rank allowed sites using a stored availability snapshot while still relying on live availability.
- `--projectionMode window-edge`: generate a release-morning shortlist from the exact window-edge target date before booking.
- `--projectionPolicy exact-fit-only|allow-partial`: choose whether release booking falls back to partial projected fits when no exact fit exists.
- `--headed`: run visible browsers for debugging or manual intervention.
- `--checkoutAuthMode auto|manual`: choose how checkout re-auth is handled.
- `--notificationProfile test|production`: choose which iMessage recipient profile gets the final inventory summary.

`src/release.ts` powers `npm run book` and adds wrapper-only scheduling flags:

- `--launchTime <HH:MM:SS>`: required launch time for today.
- `--scoutLeadMinutes <mins>`: when to freeze the scout target set before launch.
- `--warmupLeadSeconds <secs>`: when to start `race.ts` warm-up before launch.
- `--projectionLeadMinutes <mins>`: when to run the release-morning projection crawl before launch.
- `--allowProjectionOutsideWindowEdge`: bypass the safety check when the target date is not exactly today + 4 months.

In `--projectionMode window-edge`, the wrapper:

1. validates sessions, and optionally carts when cart preflight is enabled
2. waits until the projection time
3. crawls the exact target arrival date and stay length for the allowed sites
4. writes a dated shortlist JSON/Markdown under [`camp sites/availability`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/camp%20sites/availability)
5. books only the exact-fit sites by default

## Safe Boundary
The automation boundary is still intentional: Bear Lake Booker can reach the shopping cart hold state, but it does not complete checkout or payment. ReserveAmerica may still require a CAPTCHA or checkout login during capture, so the live workflow is:

1. Authenticate the account or accounts with `npm run auth`.
2. Run monitoring or `npm run race`.
3. If a hold lands, open the cart with `npm run view-cart`.
4. Complete checkout manually before the hold expires.

For `npm run book`, the guided workflow validates sessions before launch, reads the latest scout shortlist as the source of truth, and then starts `race.ts` with the resolved `--time` and `--sites`. Add `--cartPreflight` if you want the stricter empty-cart check before launch.

## Camp Site Lists
Ranked site lists live under [`camp sites`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/camp%20sites).

The operational shortlist is [`preferred-sites.md`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/camp%20sites/preferred-sites.md), which uses:

- `## Top choices`
- `## Backups`
- `## Exclude`

The runtime derives the final allowlist as `Top choices + Backups - Exclude`. If both `--sites` and `--siteList` are provided, `--sites` still wins.

Availability data is now split into:

- snapshots: [`camp sites/availability/snapshots`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/camp%20sites/availability/snapshots)
- reports and shortlists: [`camp sites/availability/reports`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/camp%20sites/availability/reports)

`site-availability` writes canonical JSON snapshots into the snapshots directory by default. Guided scout writes shortlist JSON/Markdown into the reports directory. Legacy files in [`camp sites/availability`](/Users/jasricha/Documents/Github_Personal/bear-lake-booker/camp%20sites/availability) are still read as fallback during migration.

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
