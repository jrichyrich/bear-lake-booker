import { type BrowserContext, type Page } from 'playwright';
import { resolve } from 'path';
import * as fs from 'fs';
import { SESSION_FILE } from './config';

/**
 * Resolves the session filename for a given account.
 * If no account is provided, defaults to the standard session file.
 */
export function getSessionFile(account?: string): string {
  if (!account) return SESSION_FILE;
  // Use the username prefix of the email string for the session path
  const accountPrefix = account.split('@')[0];
  return `session-${accountPrefix}.json`;
}

/**
 * Returns the absolute path to a session file.
 */
export function getSessionPath(account?: string): string {
  return resolve(process.cwd(), getSessionFile(account));
}

/**
 * Checks if a session file exists for a given account.
 */
export function sessionExists(account?: string): boolean {
  return fs.existsSync(getSessionPath(account));
}

/**
 * Validates if a page is currently logged in by checking for "Sign Out" or "My Account" indicators.
 */
export async function isSessionValid(page: Page): Promise<boolean> {
  try {
    const bodyText = (await page.textContent('body')) || '';
    return (
      bodyText.includes('Sign Out') || 
      bodyText.includes('My Account') || 
      bodyText.includes('Member Sign Out')
    );
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
