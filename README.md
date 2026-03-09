# Bear Lake Booker

Bear Lake Booker is a TypeScript-based CLI tool designed to automate checking for campsite availability at Bear Lake State Park via the ReserveAmerica reservation system. It provides both low-overhead HTTP monitoring and high-concurrency browser automation for competitive booking.

## Key Technologies
*   **Runtime:** Node.js
*   **Language:** TypeScript (strict mode)
*   **Execution:** `tsx` (TypeScript Execute)
*   **Automation:** 
    *   **Native Fetch:** Direct HTTP form submission for standard monitoring.
    *   **Playwright:** Multi-agent persistent browser automation for "Race Mode".
*   **Notifications:** AppleScript-based iMessage and Desktop notifications.
*   **Target:** [Bear Lake State Park](https://utahstateparks.reserveamerica.com/camping/bear-lake-state-park/r/campgroundDetails.do?contractCode=UT&parkId=343061)

## Architecture
The project is divided into monitoring and capture phases:

1.  **Standard Monitoring (`src/index.ts`):** 
    *   Uses `src/reserveamerica.ts` to perform direct HTTP POST requests to the reservation system.
    *   Parses the returned calendar HTML to determine exact-date and nearby-date availability.
    *   Designed for long-running, single-threaded monitoring with minimal resource usage.
2.  **Race Mode (`src/race.ts`):**
    *   Supports two triggers:
        *   **Hybrid:** Polls via HTTP first, then launches Playwright agents only when an opening is detected.
        *   **Scheduled:** Launches agents at a specific time (e.g., 08:00:00) to compete for newly released sites.
    *   Launches multiple parallel Playwright agents using `launchPersistentContext` isolating cookies, caches, and storage.
    *   Agents navigate directly to site details to bypass slow calendar interactions.
    *   Supports explicit `--sites` targeting for release-window races and can pause for manual CAPTCHA resolution when ReserveAmerica challenges cart entry.
    *   Automation stops after adding a hold to the shopping cart; payment remains manual.
3.  **Authentication (`src/auth.ts`):**
    *   Helper to log in manually and save the session state under `.sessions/`.
    *   Required for `race.ts` to launch automatically logged in.
4.  **Inspection (`src/inspect.ts`):**
    *   Utility to capture and log ReserveAmerica network traffic for analyzing the reservation flow.

## Building and Running
### Prerequisites
*   Node.js and npm installed.
*   Playwright browsers installed: `npx playwright install`
*   Logged-in session: `npm run auth` (run this once to create the account session under `.sessions/`)

### CLI Commands
*   **Standard Check:** `npm start -- -d 08/15/2026 -l 3 -o "BIRCH"`
*   **Continuous Monitoring:** `npm start -- -i 5` (Poll every 5 mins)
*   **Hybrid Capture:** `npm run race -- -d 08/15/2026 -m 5 -c 4` (HTTP poll, then launch 4 isolated agents on hit)
*   **Scheduled Capture:** `npm run race -- -c 10 -t 07:59:59 --sites BH09,BH11` (Launch 10 agents at exactly 07:59:59 and focus on specific sites)
*   **Dry-Run Capture:** `npm run race -- -m 5 -c 1 --dryRun --headed` (Open browser but don't hold site)
*   **Inspect Traffic:** `npm run inspect`
*   **Verify Types:** `npx tsc --noEmit`

## Safe Boundary
Bear Lake Booker can automate through the shopping-cart hold step, but it does not automate final payment. ReserveAmerica may still require a checkout sign-in or CAPTCHA before the cart is populated, so the safest live workflow is: pre-authenticate, let agents race, solve any checkout challenge manually, then complete payment yourself from `npm run view-cart`.
