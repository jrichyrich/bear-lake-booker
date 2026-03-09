# Cross-Cutting Scan Results

### Dead Code & Stubs
- No explicit `TODO`, `FIXME`, or `NotImplementedError` found in core source.

### Hardcoded Secrets & PII
- `src/config.ts`: Contains hardcoded recipient email `richards_jason@me.com`.
- `src/config.ts`: Contains default account `lisarichards1984@gmail.com`.
- `.sessions/`: Active session cookies are stored here with restricted permissions (`0700` directory / `0600` files) enforced by `src/session-utils.ts`.
- Legacy root-level `session.json`: Compatibility code now hardens this file to `0600` when encountered, but it may still remain on disk until manually removed.

### Hardcoded URLs
- Extensive use of `https://utahstateparks.reserveamerica.com` throughout `src/reserveamerica.ts`, `src/automation.ts`, and `src/config.ts`. While expected for a targeted tool, it makes porting to other parks difficult.

### Dependencies & Vulnerabilities
- `npm audit`: 0 vulnerabilities found.
- Dependencies are modern (Playwright 1.58, TypeScript 5.9).

### Complexity & Test Ratio
- **Source Lines**: ~2,495 TS
- **Test Lines**: ~85 TS
- **Ratio**: ~29:1 (Extremely low test coverage). Core logic in `src/automation.ts` and `src/race.ts` is entirely untested.

### Interface Exports
- Modules are well-structured with clear functional boundaries.
- `src/automation.ts` exports 10+ functions, acting as a high-level driver for Playwright.
