# Bear Lake Booker

## Project Overview
Bear Lake Booker is a TypeScript-based CLI tool designed to automate checking for campsite availability at Bear Lake State Park via the ReserveAmerica reservation system.

### Key Technologies
*   **Runtime:** Node.js
*   **Language:** TypeScript
*   **Automation Tools:** 
    *   `agent-browser` (for standard single checks)
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
    *   Uses `child_process.execSync` to call `agent-browser` commands.
    *   Designed for continuous, single-threaded monitoring (checking every X minutes).
2.  **Race Mode (`src/race.ts`):**
    *   Uses **Playwright** to spawn N isolated browser contexts concurrently.
    *   Employs a "Prime and Fire" strategy: All contexts navigate to the page and fill out the form, then wait for a specific exact target time (e.g., `08:00:00`) before simultaneously clicking Search with a randomized jitter to avoid bot detection.
    *   Designed for high-stakes ticket drops.

## Building and Running
### Prerequisites
*   Node.js and npm installed.
*   `agent-browser` in path (for standard mode).
*   Playwright browsers installed (`npx playwright install chromium`).

### Key Commands
*   **Standard Check:** `npm start` or `npx tsx src/index.ts -d 08/15/2026 -l 3 -o "BIRCH"`
*   **Continuous Monitoring:** `npx tsx src/index.ts -i 5` (Runs every 5 mins)
*   **RACE Mode:** `npm run race -- -c 10 -t 07:59:59` (Spawns 10 agents, primes them, and fires at exactly 07:59:59).
*   **Show help:** `npx tsx src/race.ts --help`
*   **Install dependencies:** `npm install`
*   **Check Types:** `npx tsc --noEmit`

## Development Conventions
*   **Configuration:** The target date, loop, and length of stay are configurable via CLI arguments.
*   **Defaults:** Defaults are set to July 22, 2026, for 6 nights in the BIRCH loop.
*   **Selectors:** The script prioritizes explicit CSS IDs (e.g., `#loop`, `#arrivaldate`) for reliability, with a fallback to ARIA role/name labels if IDs fail.
*   **Type Safety:** Uses strict TypeScript configuration (see `tsconfig.json`).
