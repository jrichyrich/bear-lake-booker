## Bear Lake Booker - Strategic Architecture Review

The current `bear-lake-booker` architecture is highly effective at its primary objective: winning a race condition at an exact predetermined moment. The underlying primitives (Playwright Stealth, DOM polling, targeted site URL construction) are sound.

However, taking a step back, the system relies far too heavily on "The Anxious Operator." It requires you to be awake, to execute terminal commands at exact moments, to manage sessions by hand, and to accurately input precise flags.

Here is a review of the design, highlighting the biggest gaps and how we should think about solving them next.

### 1. The Reactivity Gap (The Daemon Problem)
**The Problem:** The tool currently has two disconnected modes: a lightweight HTTP monitor and a heavyweight Playwright racer. When the HTTP monitor finds an opening, it doesn't automatically trigger the Playwright agents to secure it (unless you use the hybrid flag on `race.ts`, which still requires manual startup).
**The Fix:** We should combine these into a unified **Watchdog Daemon**. This service would run 24/7. It would poll the HTTP endpoint cheaply. When an opening is detected, the watchdog would *internally orchestrate* the firing of the Playwright race agents autonomously. 

### 2. The Information Gap (Single-Date Scanning)
**The Problem:** To check availability for a weekend in July, you have to pass `-d 07/15/2026`. If you are flexible on dates, you have to run multiple entirely separate instances of the script. However, the ReserveAmerica HTTP endpoint inherently returns a full 14-day calendar window per request. We are throwing away 13 days of data on every pull.
**The Fix:** Implement `--dateRange 06/01/2026-08/31/2026`. We can efficiently parse the grid response to look for N consecutive days anywhere within that window, drastically increasing your odds of finding a cancellation without spamming their servers.

### 3. The Automation Boundary (Session Expiry)
**The Problem:** The entire system breaks if the session expires, which enforces the "15-minute protocol" where you must babysit the script right before 8 AM.
**The Fix:** Now that we have `keychain.ts` integrated directly into the tool, we can build a headless `refreshSession()` utility. The Watchdog daemon could check the `expires` timestamp inside `.sessions/session.json`, and if it's within 5 minutes of expiring, it could quietly spin up a headless browser in the background, auto-fill the login form from the keychain, save a fresh JSON file, and go back to sleep. You'd never have to run `npm run auth` manually again.

### 4. Communication (Remote Notifications)
**The Problem:** If the agent secures a site at 2 PM while you are away from the computer, you will only know about it if you are staring at your macOS desktop. Holds expire in 15 minutes.
**The Fix:** Add support for a free Push Notification service (like `ntfy.sh` or Pushover) or Twilio SMS so you get an instant phone alert saying "Site captured! You have 14 minutes to pay!"

### Structural Priority
If I were to prioritize the backlog based on maximizing your chances of getting a campsite while minimizing your manual effort:

1. **Date Range Scanning:** Maximizes targets with zero extra server load.
2. **Push Notifications:** Guarantees you never miss an autonomous hold.
3. **The Watchdog Daemon:** Eliminates the need to manually trigger the agents.
4. **Auto-Session Refresh:** Eliminates the need to manage logins manually.

I have updated the `ARCHITECTURE.md` heavily with these concepts. Are any of these four items something you'd like to dive into now?
