# Intent Map

## Chunk: Availability Data & Reports
- **Purpose**: Pull availability from ReserveAmerica, parse HTML calendars, and turn the results into ranked reports and snapshots.
- **User-facing feature(s)**: HTTP monitoring, full-loop availability reports, per-site calendar scouting
- **Files**: `src/reserveamerica.ts`, `src/availability.ts`, `src/availability-utils.ts`, `src/availability-snapshots.ts`, `src/site-calendar.ts`, `src/site-availability.ts`, `src/site-availability-utils.ts`, `src/site-lists.ts`
- **Key functions/classes**: `searchAvailability`, `parseSearchResultPage`, `fetchSiteCalendarAvailability`, `writeAvailabilitySnapshot`, `rankRequestedSitesForCapture`, `loadSiteList`
- **Inputs**: arrival date(s), stay length, loop, optional site allowlist, optional snapshot path
- **Outputs**: site availability rows, per-site calendar summaries, JSON/Markdown/CSV snapshots, ranked site lists
- **Depends on**: ReserveAmerica HTML responses, local filesystem
- **Risk level**: High

## Chunk: Race Orchestration
- **Purpose**: Allocate agents across accounts, sequence booking attempts, and summarize the run.
- **User-facing feature(s)**: Hybrid race mode, multi-agent coordination, multi-hold capture
- **Files**: `src/race.ts`, `src/account-booker.ts`, `src/account-booker-runtime.ts`, `src/booking-policy.ts`, `src/site-targeting.ts`, `src/launch-strategy.ts`, `src/reporter.ts`, `src/flow-contract.ts`
- **Key functions/classes**: `startRace`, `launchCapture`, `runAgent`, `AccountBooker`, `AccountBookerRuntime`, `assignPreferredSitesToAgents`
- **Inputs**: capture CLI flags, account list, target sites, session state
- **Outputs**: browser launches, hold records, per-agent summaries, process exit codes
- **Depends on**: browser automation chunk, auth/session chunk, availability data chunk
- **Risk level**: High

## Chunk: Browser Automation & Cart Handling
- **Purpose**: Drive Playwright through the search, site, order-details, and cart flows.
- **User-facing feature(s)**: Automated booking, cart confirmation, checkout-auth recovery
- **Files**: `src/automation.ts`, `src/cart-detection.ts`, `src/checkout-auth.ts`
- **Key functions/classes**: `primeSearchForm`, `resolveTargetSites`, `continueToOrderDetails`, `addToCart`, `inspectCartState`, `determineCartConfirmation`
- **Inputs**: Playwright pages/contexts, target site selection, target date, stay length, account/session info
- **Outputs**: selected sites, order-details transitions, cart verification results, debug artifacts
- **Depends on**: ReserveAmerica DOM shape, keychain/session helpers
- **Risk level**: High

## Chunk: Auth & Session Management
- **Purpose**: Create, validate, renew, and load account sessions and credentials.
- **User-facing feature(s)**: Manual auth, auto-login, session renewal, cart viewing
- **Files**: `src/auth.ts`, `src/session-utils.ts`, `src/session-manager.ts`, `src/keychain.ts`, `src/setup-keychain.ts`, `src/check-session.ts`, `src/view-cart.ts`
- **Key functions/classes**: `setupAuthForAccounts`, `performAutoLogin`, `ensureActiveSession`, `getReserveAmericaCredentials`, `validateSessionActive`
- **Inputs**: account identifiers, keychain entries, saved storage-state JSON
- **Outputs**: session files, renewed browser state, opened cart windows
- **Depends on**: Playwright, macOS Keychain, local filesystem
- **Risk level**: Medium

## Chunk: Release Wrapper & Projection
- **Purpose**: Freeze a site target set before launch time and invoke `race.ts` with a release-day plan.
- **User-facing feature(s)**: Scheduled release runs, release-morning projection shortlist
- **Files**: `src/release.ts`, `src/release-utils.ts`, `src/projection-shortlists.ts`
- **Key functions/classes**: `resolveReleaseSchedule`, `resolveProjectionAt`, `resolveTargetSites`, `runProjectionShortlist`, `buildReleaseRaceArgs`
- **Inputs**: launch time, target date, stay length, site list/snapshot, accounts
- **Outputs**: resolved site shortlist, projection artifacts, spawned race process
- **Depends on**: availability data chunk, auth/session chunk, race orchestration chunk
- **Risk level**: High

## Chunk: Monitoring, Notifications & Ops Utilities
- **Purpose**: Provide low-overhead monitoring, wrapper flows, notifications, and network-inspection tooling.
- **User-facing feature(s)**: Continuous monitor, end-to-end wrapper, iMessage/desktop notifications, request capture
- **Files**: `src/index.ts`, `src/notify.ts`, `src/inspect.ts`, `src/flow.ts`, `src/timer-utils.ts`, `src/config.ts`, `src/theme.ts`, `src/serial-task-queue.ts`, `src/test-notify.ts`, `scripts/find_open_date.ts`, `scripts/test_session.ts`
- **Key functions/classes**: `checkAvailability`, `notifySuccess`, `notifyFinalInventorySummary`, `waitForTargetTime`, `attachLogging`
- **Inputs**: monitor CLI args, success events, timing information, browser traffic
- **Outputs**: notifications, logs, flow orchestration, network captures
- **Depends on**: availability data chunk, race orchestration chunk, auth/session chunk
- **Risk level**: Medium
