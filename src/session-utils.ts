import { type BrowserContext, type Page } from 'playwright';
import { resolve, join } from 'path';
import * as fs from 'fs';
import { SESSION_FILE, SESSION_DIR } from './config';

/**
 * Returns the absolute path to the sessions directory.
 * Ensures the directory exists with restricted permissions (700).
 */
export function getSessionDir(): string {
  const dir = resolve(process.cwd(), SESSION_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  } else {
    // Ensure existing directory has correct permissions
    fs.chmodSync(dir, 0o700);
  }
  return dir;
}

/**
 * Resolves the session filename for a given account.
 */
export function getSessionFile(account?: string): string {
  if (!account) return SESSION_FILE;
  const accountPrefix = account.split('@')[0];
  return `session-${accountPrefix}.json`;
}

/**
 * Returns the absolute path to a session file.
 */
export function getSessionPath(account?: string): string {
  return join(getSessionDir(), getSessionFile(account));
}

/**
 * Checks if a session file exists for a given account.
 * If it exists, ensures it has restricted permissions (600).
 */
export function sessionExists(account?: string): boolean {
  const path = getSessionPath(account);
  const exists = fs.existsSync(path);
  if (exists) {
    try {
      fs.chmodSync(path, 0o600);
    } catch { /* ignore */ }
  }
  return exists;
}

/**
 * Returns summary info about the session's cookie lifecycle.
 */
export function getSessionExpiryInfo(account?: string): { isExpired: boolean; earliestExpiry: Date | null } {
  const path = getSessionPath(account);
  if (!fs.existsSync(path)) return { isExpired: true, earliestExpiry: null };

  try {
    const state = JSON.parse(fs.readFileSync(path, 'utf-8'));
    const now = Date.now() / 1000;
    
    // JSESSIONID is a session cookie (expires: -1), so we look at AWSALB and others
    const expiringCookies = state.cookies.filter((c: any) => c.expires !== -1);
    
    if (expiringCookies.length === 0) return { isExpired: false, earliestExpiry: null };

    const minExpiry = Math.min(...expiringCookies.map((c: any) => c.expires));
    return {
      isExpired: now >= minExpiry,
      earliestExpiry: new Date(minExpiry * 1000),
    };
  } catch {
    return { isExpired: true, earliestExpiry: null };
  }
}

/**
 * Robustly validates if a session is ACTIVE by attempting to navigate to a protected page.
 * If the server redirects us to the login page, the session is invalid.
 */
export async function validateSessionActive(page: Page): Promise<boolean> {
  const MY_ACCOUNT_URL = 'https://utahstateparks.reserveamerica.com/memberAccountHome.do';
  const LOGIN_URL_PART = 'memberSignIn.do';

  try {
    // 1. Navigate to a protected URL
    await page.goto(MY_ACCOUNT_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // 2. Check the final URL. If it contains memberSignIn.do, we were redirected (Session Expired).
    const finalUrl = page.url();
    if (finalUrl.includes(LOGIN_URL_PART)) return false;

    // 3. Double-check for login indicators in HTML
    const bodyText = (await page.textContent('body')) || '';
    return bodyText.includes('Sign Out') || bodyText.includes('Member Sign Out');
  } catch {
    return false;
  }
}

/**
 * Passive check: Scans the current page for login indicators without navigating.
 */
export async function isSessionValid(page: Page): Promise<boolean> {
  try {
    const bodyText = (await page.textContent('body')) || '';
    if (bodyText.includes('Sign In / Sign Up')) return false;
    return bodyText.includes('Sign Out') || bodyText.includes('Member Sign Out');
  } catch {
    return false;
  }
}

/**
 * Injects session state into a browser context.
 * Prefers Playwright's native storageState but supports manual injection if needed.
 */
export async function injectSessionState(context: BrowserContext, sessionFile: string): Promise<void> {
  const sessionPath = resolve(process.cwd(), sessionFile);
  if (!fs.existsSync(sessionPath)) return;

  const state = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));

  if (state.cookies) {
    await context.addCookies(state.cookies);
  }

  // Handle manual localStorage injection for cross-origin state if origins exist
  if (state.origins && state.origins.length > 0) {
    const page = await context.newPage();
    for (const origin of state.origins) {
      if (origin.localStorage && origin.localStorage.length > 0) {
        await page.goto(origin.origin, { waitUntil: 'domcontentloaded' }).catch(() => { });
        await page.evaluate((data) => {
          for (const item of data.localStorage) {
            localStorage.setItem(item.name, item.value);
          }
        }, origin).catch(() => { });
      }
    }
    await page.close();
  }
}
