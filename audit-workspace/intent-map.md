# Intent Map

### Chunk: ReserveAmerica API Integration
- **Purpose**: Low-level communication with the ReserveAmerica reservation system using standard HTTP requests.
- **User-facing feature(s)**: Availability checking, search filtering.
- **Files**: `src/reserveamerica.ts`, `src/flow.ts`.
- **Key functions/classes**: `searchAvailability`, `parseSearchResult`, `resolveLoopValue`.
- **Inputs**: Search parameters (date, length, loop).
- **Outputs**: `SearchResult` object containing site availability details.
- **Depends on**: `src/config.ts`.
- **Risk level**: High (core functionality, sensitive to system changes).

### Chunk: Standard Monitoring
- **Purpose**: Continuous background monitoring for campsite openings.
- **User-facing feature(s)**: "Standard Check", "Continuous Monitoring".
- **Files**: `src/index.ts`.
- **Key functions/classes**: `main` polling loop.
- **Inputs**: CLI arguments (interval, target date).
- **Outputs**: Console logs, notifications.
- **Depends on**: `ReserveAmerica API Integration`, `src/notify.ts`.
- **Risk level**: Low.

### Chunk: Race Mode (Automation)
- **Purpose**: High-speed, multi-agent browser automation to secure sites at release time.
- **User-facing feature(s)**: "Hybrid Capture", "Scheduled Capture".
- **Files**: `src/race.ts`, `src/automation.ts`.
- **Key functions/classes**: `runAgent`, `launchCapture`, `primeSearchForm`, `addToCart`.
- **Inputs**: Target site list, concurrency settings.
- **Outputs**: Screenshots of successful holds, notification alerts.
- **Depends on**: `Playwright`, `Authentication & Session Management`, `src/reporter.ts`.
- **Risk level**: High (complex state management, potential for blocking).

### Chunk: Authentication & Session Management
- **Purpose**: Handles user identity, secure credential storage, and session persistence.
- **User-facing feature(s)**: Authentication login, Session persistence.
- **Files**: `src/auth.ts`, `src/check-session.ts`, `src/session-manager.ts`, `src/session-utils.ts`, `src/keychain.ts`, `src/setup-keychain.ts`.
- **Key functions/classes**: `setupAuthForAccounts`, `performAutoLogin`, `ensureActiveSession`, `getPassword`, `saveReserveAmericaCredentials`.
- **Inputs**: User credentials (manual or keychain).
- **Outputs**: `session.json` state, macOS Keychain entries.
- **Depends on**: `macOS Security CLI`, `Playwright`.
- **Risk level**: High (security of credentials, session validity).

### Chunk: Infrastructure & Utilities
- **Purpose**: Shared configuration, notification logic, and reporting helpers.
- **User-facing feature(s)**: Notifications, Run reports.
- **Files**: `src/config.ts`, `src/notify.ts`, `src/reporter.ts`, `src/theme.ts`, `src/timer-utils.ts`.
- **Key functions/classes**: `notifySuccess`, `writeRunSummary`.
- **Inputs**: Event data, status updates.
- **Outputs**: AppleScript notifications, summary log files.
- **Depends on**: System shell (for notifications).
- **Risk level**: Low.

### Chunk: Inspection & Debugging
- **Purpose**: Development tools for analyzing network traffic and verifying session health.
- **User-facing feature(s)**: Traffic inspection, session verification.
- **Files**: `src/inspect.ts`, `src/test-notify.ts`, `src/view-cart.ts`, `scripts/test_session.ts`, `scripts/find_open_date.ts`.
- **Key functions/classes**: `inspectTraffic`, `viewCart`.
- **Inputs**: Live network traffic, session files.
- **Outputs**: Traffic logs, browser views.
- **Depends on**: `Playwright`.
- **Risk level**: Medium (leaks traffic data if not handled carefully).
