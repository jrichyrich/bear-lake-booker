# Bear Lake Booker

## Project Overview
Bear Lake Booker is a TypeScript-based CLI tool designed to automate checking for campsite availability at Bear Lake State Park via the ReserveAmerica reservation system.

### Key Technologies
*   **Runtime:** Node.js
*   **Language:** TypeScript
*   **Automation Tools:** 
    *   direct HTTP form submission for standard monitoring
    *   **Playwright** (for high-concurrency "Race Mode")
*   **Target:** [Bear Lake State Park](https://utahstateparks.reserveamerica.com/camping/bear-lake-state-park/r/campgroundDetails.do?contractCode=UT&parkId=343061)

## Park Reservation Rules
*   **Rolling Window:** 4-month rolling basis (e.g., March 2nd allows reservations through July 2nd).
*   **Extended Booking:** Reservations can extend up to 13 days beyond the end of the rolling window as long as the arrival date is within the window.
*   **Modification Lock:** Reservations extending beyond the furthest arrival date must wait 21 days before changes can be made.
*   **Vehicle Policy:** Campers and RVs are considered primary camping units, not extra vehicles.
*   **No Refunds:** No refunds for changing park conditions (water levels, fire bans).

## Architecture
The project supports two main modes of operation:

1.  **Standard Monitoring (`src/index.ts`):** 
    *   Loads the campground page, reuses the session cookie, and submits the search form directly.
    *   Parses the returned calendar HTML to determine exact-date and nearby-date availability.
    *   Designed for continuous, single-threaded monitoring (checking every X minutes).
2.  **Race Mode (`src/race.ts`):**
    *   Uses HTTP monitoring first, and only launches **Playwright** when an exact-date opening is detected.
    *   In scheduled drop mode, Playwright can still prime the search form and fire at an exact target time (e.g., `08:00:00`) with randomized jitter.
    *   Resolves the site from the search-results row, opens the site details page with the requested arrival date and stay length preloaded, and can stop safely at `Order Details`.
    *   Designed for high-stakes captures where browser automation is only used for the booking flow boundary.

## Building and Running
### Prerequisites
*   Node.js and npm installed.
*   Playwright browsers installed (`npx playwright install chromium`).

### Key Commands
*   **Standard Check:** `npm start` or `npx tsx src/index.ts -d 08/15/2026 -l 3 -o "BIRCH"`
*   **Continuous Monitoring:** `npx tsx src/index.ts -i 5` (Runs every 5 mins)
*   **Hybrid Capture:** `npm run race -- -m 5 -c 4` (Polls every 5 mins, then launches 4 Playwright agents when an exact-date hit appears)
*   **Scheduled Capture:** `npm run race -- -c 10 -t 07:59:59` (Primes 10 agents and fires at exactly 07:59:59 without HTTP preflight)
*   **Dry-Run Capture:** `npm run race -- -m 5 -c 1 --dryRun --headed` (Opens site details when found, but never continues to `Order Details`)
*   **Safe Hold to Order Details:** `npm run race -- -d 06/09/2026 -l 6 -o BIRCH -c 1 --book` (stops at `Order Details`; does not continue to `Review Cart` or payment)
*   **Create `session.json`:** `npm run auth` (opens a browser for manual login and saves Playwright storage state)
*   **Show help:** `npx tsx src/race.ts --help`
*   **Install dependencies:** `npm install`
*   **Check Types:** `npx tsc --noEmit`

## Development Conventions
*   **Configuration:** The target date, loop, and length of stay are configurable via CLI arguments.
*   **Defaults:** Defaults are set to July 22, 2026, for 6 nights in the BIRCH loop.
*   **Loop Resolution:** The standard monitor resolves loop labels such as `BIRCH` to ReserveAmerica's internal option value before submitting the search.
*   **Availability Parsing:** The first calendar column is treated as the requested arrival date; later columns are treated as nearby alternatives.
*   **Capture Strategy:** Browser automation assigns form fields directly in the DOM, resolves the site details URL from the results-row link, and uses the preloaded site page to avoid brittle calendar clicks.
*   **Dry Runs:** `--dryRun` overrides booking behavior and stops at site details even if `--book` is also passed.
*   **Safe Booking Boundary:** `--book` now means "proceed until `Order Details` is confirmed, then stop." It does not continue into `Review Cart`, `Checkout`, or payment.
*   **Type Safety:** Uses strict TypeScript configuration (see `tsconfig.json`).
