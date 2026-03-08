# Autonomous Pipeline Architecture Roadmap

The current `bear-lake-booker` architecture excels at winning race conditions at precise moments (e.g., 8:00:00.000 AM) when triggered manually by an operator.

To achieve a true "Set It and Forget It" system that can autonomously monitor and secure cancelled reservations 24/7 without manual intervention, the system requires an **Autonomous Pipeline**.

This document outlines the strategic plan, implementation details, and testing approach for the four core pillars of the Autonomous Pipeline.

---

## 1. The Watchdog Daemon

**Concept:** Combine the lightweight HTTP monitor (`index.ts`) and the heavyweight Playwright racer (`race.ts`) into a single, unified, long-running process.
**Goal:** Eliminate the need for a human to manually execute `npm run race` when `npm start` detects an opening.

### Implementation Plan
- Create `src/watchdog.ts`.
- Implement a state machine: `IDLE → MONITORING → RACING → COOLDOWN → MONITORING`.
- The daemon uses the low-overhead `reserveamerica` fetch logic to poll the calendar grid on an interval (e.g., every 5 minutes).
- When an opening is detected, the daemon *internally* spawns the Playwright agents (reusing the core logic from `race.ts`), injects the active session, and races to hold the cart.

### Testing Plan
- **Dry-Run Mode:** Run the Watchdog against a known open site with `--dryRun`. Ensure the monitor detects the opening and automatically launches the headless Playwright agents, which should stop exactly at the Order Details page.
- **Cooldown Logic:** Verify that if the race fails, the state machine enters a cooldown period before resuming monitoring, preventing infinite racing loops against phantom availability.

---

## 2. Date Range Scanning

**Concept:** Instead of polling for a single specific date (`-d 07/15/2026`), poll for a contiguous block of dates over a large window (`--dateRange 06/01/2026-08/31/2026`).
**Goal:** Drastically increase the surface area of potential successful hits without increasing HTTP request volume to ReserveAmerica. ReserveAmerica's calendar grid inherently returns 14 days of data per request; currently, 13 days of that data are ignored.

### Implementation Plan
- Add `--dateRange` CLI flag (e.g., `--dateRange 07/01/2026-07/31/2026`).
- Keep the `--length` flag (e.g., `-l 3` for 3 nights).
- Modify the parsing logic in `reserveamerica.ts` to scan the returned 14-day grid. Look for any horizontal block of contiguous `avail` cells that matches or exceeds the requested `--length`.
- Batch HTTP requests in 14-day increments to cover the entire requested range efficiently.

### Testing Plan
- **Unit Testing:** Provide the Cheerio parser with mocked HTML payloads containing various availability patterns and assert that it correctly identifies valid blocks.
- **Live Dry-Run:** Target a low-demand state park in the offseason over a 30-day window and ensure the scanner identifies any 3-night block.

---

## 3. Auto-Session Refresh (Headless Auth)

**Concept:** Proactively renew the `session.json` authentication token before it expires, entirely in the background.
**Goal:** Eliminate the need for the human operator to run `npm run auth` in a visible browser window every time the session expires, which is a hard prerequisite for 24/7 autonomous monitoring.

### Implementation Plan
- Create a `refreshSession()` utility in `src/automation.ts`.
- The Watchdog periodically checks the `expires` timestamp of the cookies in `session.json`.
- If the token is near expiration (e.g., < 5 minutes), the Watchdog spawns a strictly headless Playwright instance.
- Using `puppeteer-extra-plugin-stealth` to bypass the WAF, the headless agent navigates to the login page, retrieves the credentials securely from `src/keychain.ts`, submits the form, and rewrites the fresh cookies to `session.json`.

### Testing Plan
- **Headless Prototyping:** Create a `test_headless_auth.ts` script to verify if ReserveAmerica's WAF (Cloudflare/Incapsula) triggers a blocking Captcha against a headless stealth browser. 
- **Graceful Failure:** If a Captcha is triggered, the system must abort the headless refresh, retain the old (expiring) session, and trigger an immediate "Manual Auth Required" push notification to the operator.

---

## 4. Multi-Channel Push Notifications

**Concept:** Send instant remote alerts (to a phone or watch) when an autonomous event occurs.
**Goal:** Because ReserveAmerica holds expire in 15 minutes, you must be notified instantly when the Watchdog successfully secures a cart hold so you can manually log in and complete the payment.

### Implementation Plan
- Refactor the existing macOS Desktop/iMessage `notify.ts` into a pluggable interface.
- Integrate `ntfy.sh` (a free, zero-setup push notification service) or Pushover.
- The Watchdog triggers an escalating sequence upon a successful cart hold: "Hold Secured! 14m remaining!" -> "Hold Expiring! 5m remaining!".

### Testing Plan
- **Integration Test:** Create `test-push.ts` that triggers sample push payload to the configured `ntfy.sh` topic. Verify delivery to the mobile device.
- **End-to-End Watchdog:** During a `--dryRun` Watchdog hit, verify the push notification is fired exactly when the cart page is reached and the agent execution halts.
