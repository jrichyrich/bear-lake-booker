import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

import { getReserveAmericaCredentials } from './keychain';
import { getThemeArgs } from './theme';
import {
  getReadableSessionPath,
  getSessionPath,
  injectSessionState,
  normalizeAccount,
  sessionExists,
  validateSessionActive,
} from './session-utils';

const LOGIN_URL = 'https://utahstateparks.reserveamerica.com/memberSignIn.do';
const DEFAULT_TIMEOUT_MS = 120_000;

export type SessionEnsureResult = 'active' | 'renewed' | 'failed';

type EnsureActiveSessionOptions = {
  timeoutMs?: number;
  logPrefix?: string;
};

async function preFillCredentials(page: any, account?: string): Promise<void> {
  try {
    const creds = getReserveAmericaCredentials(account);
    if (!creds.username || !creds.password) {
      return;
    }

    const emailSelector = 'input[aria-label="Email"], input[placeholder*="user name"], #email';
    const passwordSelector = 'input[aria-label="Password"], input[type="password"]';

    await page.waitForSelector(emailSelector, { timeout: 10_000 });
    await page.fill(emailSelector, creds.username);
    await page.fill(passwordSelector, creds.password);
  } catch {
    // Manual login still works even if selectors/keychain lookup fail.
  }
}

export async function hasActiveSession(account?: string): Promise<boolean> {
  const normalizedAccount = normalizeAccount(account);
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({ timezoneId: 'America/Denver' });
    if (sessionExists(normalizedAccount)) {
      await injectSessionState(context, getReadableSessionPath(normalizedAccount));
    }

    const page = await context.newPage();
    return validateSessionActive(page);
  } finally {
    await browser.close().catch(() => {});
  }
}

export async function ensureActiveSession(
  account?: string,
  options: EnsureActiveSessionOptions = {},
): Promise<SessionEnsureResult> {
  const normalizedAccount = normalizeAccount(account);
  const label = normalizedAccount ?? 'default';
  const prefix = options.logPrefix ?? '';

  if (await hasActiveSession(normalizedAccount)) {
    console.log(`${prefix}Account session for ${label} is valid for account access. Proceeding.`);
    return 'active';
  }

  console.log(`${prefix}Account session for ${label} is expired or missing. Opening headed browser for manual login...`);

  const browser = await chromium.launch({
    headless: false,
    args: getThemeArgs(normalizedAccount),
  });

  try {
    const context = await browser.newContext({ timezoneId: 'America/Denver' });
    if (sessionExists(normalizedAccount)) {
      await injectSessionState(context, getReadableSessionPath(normalizedAccount));
    }

    const page = await context.newPage();
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
    await preFillCredentials(page, normalizedAccount);

    console.log(`${prefix}ACTION REQUIRED: Complete login/captcha for ${label} in the browser window.`);

    await page.waitForFunction(() => {
      const body = document.body.textContent ?? '';
      return body.includes('Sign Out') || body.includes('My Account');
    }, { timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS });

    const sessionPath = getSessionPath(normalizedAccount);
    await context.storageState({ path: sessionPath });
    console.log(`${prefix}Login confirmed. Saved refreshed account session to ${sessionPath}.`);
    return 'renewed';
  } catch {
    console.error(`${prefix}Manual account login timed out or failed for ${label}.`);
    return 'failed';
  } finally {
    await browser.close().catch(() => {});
  }
}
