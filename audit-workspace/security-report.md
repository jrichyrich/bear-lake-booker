# Security Audit Report: Bear Lake Booker

## 🔴 Critical Findings
- **None confirmed.** Previous command injection vulnerabilities in `execSync` have been resolved.

## 🟡 Medium Findings
- **Session Hijacking Risk (Local)**:
  - `confirmed:` `session.json` and `profiles/` contain active authenticated sessions for ReserveAmerica. While they are correctly ignored in `.git`, any local user with access to the machine could copy these files to hijack the session.
  - `recommendation:` Consider encrypting `session.json` at rest using a key derived from the Keychain.

## 🟢 Low Findings
- **PII Centralization**:
  - `confirmed:` All personal emails (`RECIPIENT`, `DEFAULT_ACCOUNT`) are centralized in `src/config.ts`. While much better than being scattered in logic, they are still committed to source control if that file is pushed.
  - `recommendation:` Move these to environment variables or a local `.env` file (and add `.env` to `.gitignore`).

## 🛡️ Security Strengths
- **Keychain Integration**: Excellent use of macOS Keychain for actual passwords. This ensures that even if the source code is leaked, the account password remains safe.
- **Injection Prevention**: Consistent use of `execFileSync` prevents shell injection when dispatching AppleScript notifications.
- **Stealth Browsing**: Use of `playwright-extra` with the stealth plugin reduces the footprint of the automation agents.
