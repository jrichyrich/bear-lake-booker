# Feature Health Map

| Feature | Health | Critical | Warnings | Top Issue |
|---------|--------|----------|----------|-----------|
| Standard Monitoring & Polling | 🟡 | 0 | 2 | Expired default-session auto-login path renews nothing |
| Availability Search & Site Reports | 🟡 | 0 | 2 | Ranked site lists only accept `BH##` site IDs |
| Automated Race Capture | 🔴 | 1 | 2 | Cart verification only recognizes `BH##` site IDs |
| Scheduled Release Wrapper | 🔴 | 1 | 1 | Default scout requires exact-date availability before launch |
| Multi-Account Session & Cart Operations | 🟡 | 0 | 1 | Keychain account normalization is inconsistent |
| Notifications & Debugging | 🟢 | 0 | 0 | Clean |
| Infrastructure / Cross-cutting | 🟡 | 0 | 3 | `npm test` is broken and high-risk entry points remain untested |
| Security (all features) | 🟢 | 0 | 0 | No critical security findings in tracked source |

## Health Key
- 🔴 Critical — has findings that cause real harm in production
- 🟡 Needs Work — functional with meaningful gaps
- 🟢 Clean — minor notes only or nothing to flag

## Total Finding Counts
- 🔴 Critical: 2
- 🟡 Warning: 7
- 🟢 Note: 3
- 💀 Dead weight: 0 items

## Recommended Focus Order
Fix the release wrapper first, because it can abort the exact 8:00 AM workflow the project is meant to win. Immediately after that, remove the `BH##` site-code assumption from both site lists and cart parsing so targeting and cart verification agree on what a valid site is. Once those two product-level correctness bugs are closed, tighten account normalization/timing checks and add direct tests around `race.ts`, `release.ts`, and `automation.ts` so the live flow stops depending on manual smoke tests.
