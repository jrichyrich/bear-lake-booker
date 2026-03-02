# Bear Lake Booker - Backlog

## Current Status
- Initial implementation of `index.ts` (monitoring) and `race.ts` (Playwright race mode).
- Helper `auth.ts` for session capture.
- `agent-race.ts` (Experimental CLI-based race mode).

## Backlog Tasks

### Phase 1: Foundation & Reliability
- [ ] **Initial Git Commit**: Push current codebase to GitHub.
- [ ] **Unified Configuration**: Move shared constants (PARK_URL, recipients, defaults) to a `src/config.ts`.
- [ ] **Shared Utilities**: Move notification logic (`osascript`) to a common utility file.
- [ ] **Site Selection Logic**: Allow specifying target site IDs for auto-booking, not just "any available".
- [ ] **Better Bot Detection**: Implement more varied User-Agents and human-like interaction patterns (jitter, mouse movements).

### Phase 2: User Experience
- [ ] **CLI Improvements**: Better progress reporting (e.g., `ora` or simple progress bars).
- [ ] **Documentation**: Create a comprehensive `README.md` from `GEMINI.md`.
- [ ] **Login Flow**: Consolidate `auth.ts` and `race.ts` to use a single CLI entry point for session setup.

### Phase 3: Advanced Monitoring
- [ ] **External Notifications**: Support Pushover or Telegram for non-macOS alerts.
- [ ] **Logging**: Add file-based logging for long-running monitoring sessions.
- [ ] **Site Stats**: Track how often sites become available and for how long.

## Completed Tasks
- [x] Initial `.gitignore` setup.
- [x] Basic monitoring loop.
- [x] Playwright-based Race Mode with "Prime and Fire".
