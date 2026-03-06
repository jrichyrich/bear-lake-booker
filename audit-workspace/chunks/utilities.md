# Chunk Audit: Utilities (Reporting & Notify)

## 1. Correctness (🔴/🟡/🟢)
- **Status**: 🟢
- **Findings**: The `notifySuccess` function is well-parameterized, supporting both background monitoring and competitive capture stages. Message formatting is consistent.

## 2. Resiliency (🔴/🟡/🟢)
- **Status**: 🟢
- **Findings**: 
  - `confirmed:` Individual `osascript` calls are wrapped in try-catch blocks. If Messages.app is closed or notifications are disabled, the main program logic continues unaffected.
  - `confirmed:` Double quotes in messages are escaped before being passed to AppleScript, preventing syntax errors in the shell payload.

## 3. Performance (🔴/🟡/🟢)
- **Status**: 🟢
- **Findings**: Notifications are dispatched near-instantaneously on success.

## 4. Observability (🔴/🟡/🟢)
- **Status**: 🟢
- **Findings**: The run summaries are highly detailed, capturing agent counts, booking modes, and winning site IDs. This is critical for debugging why a race was won or lost.

## 5. Style (🔴/🟡/🟢)
- **Status**: 🟢
- **Findings**: Clean implementation.
