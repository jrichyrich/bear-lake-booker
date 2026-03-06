# Chunk Audit: Inspection & Utility

- **Chunk**: Inspection & Utility
- **Files**: `src/inspect.ts`, `src/test-notify.ts`
- **Risk Level**: Low

## Behavioral
- **Confirmed**: `src/inspect.ts` provides a high-fidelity network capture mechanism into `.jsonl` format, which is essential for reverse-engineering ReserveAmerica's private APIs and keeping the automated "Race Mode" accurate.
- **Confirmed**: `src/test-notify.ts` allows safe verification of the end-to-end notification path (desktop + iMessage) without needing a real site opening.

## Structural
- **Confirmed**: Scripts are focused on developer ergonomics and debugging.

## Scalability
- **Confirmed**: Not applicable.

## Observability
- **Confirmed**: `src/inspect.ts` is a dedicated observability tool. It captures detailed request/response headers and post data, enabling precise troubleshooting of network-level failures.

## Maintainability
- **Finding**: Hardcoded recipient `richards_jason@me.com` is present again in `src/test-notify.ts`.
- **Finding**: Like `src/index.ts`, the notification logic is strictly macOS-dependent due to `osascript`.
