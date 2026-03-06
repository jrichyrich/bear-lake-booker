## Intent Map

### Chunk: ReserveAmerica API (Wrapper)
- **Purpose**: Provides a high-level TypeScript interface for interacting with the ReserveAmerica reservation system. Handles HTTP form building and HTML parsing.
- **User-facing feature(s)**: infrastructure
- **Files**: `src/reserveamerica.ts`
- **Key functions/classes**: `searchAvailability`, `parseSearchResult`, `resolveLoopValue`
- **Inputs**: Search parameters (date, stay length, loop name)
- **Outputs**: `SearchResult` object containing site availability details
- **Depends on**: `cheerio`, `src/config.ts`
- **Risk level**: High (Core dependency for all checking logic)

### Chunk: Standard Monitor
- **Purpose**: A low-overhead CLI entry point for continuous background monitoring of site availability using HTTP polling.
- **User-facing feature(s)**: Standard Monitoring
- **Files**: `src/index.ts`
- **Key functions/classes**: `main`, `checkAvailability`
- **Inputs**: CLI arguments (date, loop, interval)
- **Outputs**: Console logs and iMessage notifications
- **Depends on**: ReserveAmerica API chunk, Utilities chunk
- **Risk level**: Low

### Chunk: Race Mode (Sniper)
- **Purpose**: A high-concurrency browser automation tool designed to compete for newly released sites using parallel Playwright agents.
- **User-facing feature(s)**: Competitive Site Capture
- **Files**: `src/race.ts`
- **Key functions/classes**: `startRace`, `launchCapture`, `runAgent`, `ensureLoggedIn`, `addToCart`
- **Inputs**: High-concurrency CLI arguments, credentials from Keychain
- **Outputs**: "Held" sites in the shopping cart, success notifications, run summaries
- **Depends on**: ReserveAmerica API chunk, Auth & Session chunk, Infrastructure chunk, Utilities chunk
- **Risk level**: High (Handles stateful interactions and high-concurrency requests)

### Chunk: Auth & Session Management
- **Purpose**: Manages the user's login state, session persistence, and manual diagnostic tools. Syncs cookies and LocalStorage.
- **User-facing feature(s)**: User Authentication
- **Files**: `src/auth.ts`, `src/check-session.ts`, `src/view-cart.ts`
- **Key functions/classes**: `setupAuth`, `checkSession`, `viewCart`, `injectSession`
- **Inputs**: User credentials, manual login interactions
- **Outputs**: `session.json` state file
- **Depends on**: Playwright, Infrastructure chunk
- **Risk level**: Medium (Critical for Race Mode functionality)

### Chunk: Infrastructure (Keychain & Config)
- **Purpose**: Provides secure storage for sensitive credentials using the macOS Keychain and centralizes system-wide configuration constants.
- **User-facing feature(s)**: infrastructure
- **Files**: `src/keychain.ts`, `src/setup-keychain.ts`, `src/config.ts`
- **Key functions/classes**: `getReserveAmericaCredentials`, `saveReserveAmericaCredentials`
- **Inputs**: Manual credential setup
- **Outputs**: Credentials from Keychain
- **Depends on**: macOS `security` CLI
- **Risk level**: Low (but handles sensitive PII)

### Chunk: Utilities (Reporting & Notify)
- **Purpose**: Provides unified alerting via AppleScript (iMessage/Desktop) and generates structured run summaries for observability.
- **User-facing feature(s)**: Notifications
- **Files**: `src/notify.ts`, `src/reporter.ts`, `src/test-notify.ts`
- **Key functions/classes**: `notifySuccess`, `writeRunSummary`
- **Inputs**: Success signals from Monitor or Race mode
- **Outputs**: iMessage alerts, Desktop notifications, JSON reports in `logs/`
- **Depends on**: macOS AppleScript
- **Risk level**: Low

### Chunk: Inspection Utility
- **Purpose**: Captures and logs raw network traffic for reverse-engineering and debugging the reservation flow.
- **User-facing feature(s)**: diagnostic
- **Files**: `src/inspect.ts`
- **Key functions/classes**: `inspectTraffic`
- **Inputs**: Browser interactions
- **Outputs**: Network capture logs
- **Depends on**: Playwright
- **Risk level**: Low
