# Chunk Audit: ReserveAmerica API Integration

### Dimensions
- **Correctness**: High. Correctly builds POST bodies and parses calendar HTML.
- **Reliability**: Medium. Relies on brittle CSS selectors (`#calendar`, `.br`, `.siteListLabel`). Any changes to ReserveAmerica's UI will break this.
- **Performance**: High. Low overhead HTTP requests.

### Findings
- **Confirmed**: `fetchWithRetry` implements exponential backoff, which is good for avoiding rate limits.
- **Confirmed**: `saveDebugHtml` on failure is excellent for troubleshooting production parser errors.
- **Confirmed**: `splitSetCookieHeader` is a manual implementation of cookie splitting.

### Recommendations
- Add more robust error handling for `resolveLoopValue` if the select box doesn't exist.
- Consider moving selector definitions to a central `selectors.ts` for easier maintenance.
