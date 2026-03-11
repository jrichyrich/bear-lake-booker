# Chunk Audit: Availability Data & Reports

**User-facing feature**: HTTP monitoring, full-loop availability search, per-site calendar scouting
**Risk Level**: High
**Files Audited**: `src/reserveamerica.ts`, `src/availability.ts`, `src/availability-utils.ts`, `src/availability-snapshots.ts`, `src/site-calendar.ts`, `src/site-availability.ts`, `src/site-availability-utils.ts`, `src/site-lists.ts`
**Status**: Complete

## Purpose (as understood from reading the code)
This chunk is the non-browser intelligence layer. It queries ReserveAmerica, parses loop and site calendars, persists snapshots, and loads ranked site lists to decide which sites should matter during monitoring and release runs.

## Runtime Probe Results
- **Tests found**: Yes
- **Tests run**: 33 passed, 0 failed (`parser`, `availability-utils`, `availability-snapshots`, `site-calendar`, `site-availability-utils`, `site-lists`)
- **Import/load check**: Covered indirectly by Jest and `npx tsc --noEmit`
- **Type check**: OK
- **Edge case probes**: `parseRankedSiteList("## Top choices\n- BC85\n")` throws `Invalid site entry "- BC85". Expected a bullet like "- BH03".`
- **Key observation**: The parsing helpers are well-tested for the current `BH##` workflow, but site-list parsing is hard-coded to that prefix and rejects other site code families outright.

## Dimension Assessments

### Implemented
The intended functionality exists and is connected. `searchAvailability`, `fetchSiteCalendarAvailability`, snapshot ranking, and report writers all have real logic and test coverage.

### Correct
`src/site-lists.ts:5` and `src/site-lists.ts:92-95` hard-code site-list entries to `BH\d{2}`. That makes the allowlist system reject otherwise valid Bear Lake site IDs outside that prefix instead of treating site codes generically.

### Efficient
`src/site-calendar.ts:468-479` and `src/site-calendar.ts:512-532` can fetch one full site-details page per date during arrival sweeps. That is acceptable for small ranked lists, but it scales poorly across larger windows.

### Robust
`src/reserveamerica.ts:152-218` and `src/site-calendar.ts:179-229` fail hard on DOM-shape drift. That is better than silently returning garbage, but it means live runs depend on ReserveAmerica keeping selectors like `#calendar`, `.br`, `.siteListLabel a`, and `#nextWeek` stable.

### Architecture
The chunk is coherent, but it is intentionally single-park and single-provider. `src/config.ts` and the parsing logic lock the repo to Bear Lake/ReserveAmerica rather than abstracting a generic provider layer.

## Findings

### 🔴 Critical
- None.

### 🟡 Warning
- **[src/site-lists.ts:5]** — Ranked site lists only accept `BH##` tokens — Any `BC##` or other valid site code is rejected before the run even starts.
- **[src/site-lists.ts:92]** — Invalid site entries throw immediately — This is correct for malformed files, but because the token pattern is overly narrow it converts a supported site into a configuration error.
- **[src/site-calendar.ts:512]** — Arrival sweeps refetch site pages one date at a time — Large sweeps will be slower and noisier than necessary.

### 🟢 Note
- `src/reserveamerica.ts` and `src/site-calendar.ts` have stronger parser tests than the browser automation code.
