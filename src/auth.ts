import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());
import { getReserveAmericaCredentials } from './keychain';
import * as util from 'util';
import { getThemeArgs } from './theme';
import { getSessionFile, getSessionPath, normalizeCliAccounts, validateSessionActive } from './session-utils';

const LOGIN_URL = 'https://utahstateparks.reserveamerica.com/memberSignIn.do';

const { values } = util.parseArgs({
  args: process.argv.slice(2),
  options: {
    user: { type: 'string', short: 'u' },
  },
  strict: false,
});

const userAccounts = typeof values.user === 'string'
  ? normalizeCliAccounts(values.user.split(','), '[Auth] ')
  : [];

type ActiveSession = { browser: any, context: any, sessionFile: string, sessionPath: string };

export async function setupAuthForAccounts(accounts: string[]) {
  console.log('\n--- Manual Authentication Mode Required ---');
  console.log('1. A browser window will open for each account.');
  console.log('2. Log in manually to your ReserveAmerica accounts. (Solve any CAPTCHAs)');
  console.log('3. Once you are logged in and see your dashboard/account in all windows, come back here.');
  console.log('4. Press Enter in this terminal to save all sessions and continue.\\n');

  const usersToAuth = accounts.length > 0 ? accounts : [undefined];
  const activeSessions: ActiveSession[] = await Promise.all(
    usersToAuth.map(account => launchBrowserForAccount(account))
  );

  const areBrowsersOpen = await waitForUserCompletion(activeSessions);

  if (areBrowsersOpen) {
    await saveSessions(activeSessions);
  } else {
    console.log('A browser was closed before sessions could be saved.');
    throw new Error('Manual authentication aborted by user (browser closed).');
  }

  await Promise.all(activeSessions.map(s => s.browser.close().catch(() => { })));
}

async function setupAuth() {
  try {
    await setupAuthForAccounts(userAccounts);
    process.exit(0);
  } catch (error: any) {
    console.error(error.message);
    process.exit(1);
  }
}

async function launchBrowserForAccount(account?: string): Promise<ActiveSession> {
  const sessionFile = getSessionFile(account);
  const sessionPath = getSessionPath(account);
  const themeArgs = getThemeArgs(account);

  const browser = await chromium.launch({ headless: false, args: themeArgs });
  const context = await browser.newContext({ timezoneId: 'America/Denver' });
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
  await preFillCredentials(page, account);

  return { browser, context, sessionFile, sessionPath };
}

async function preFillCredentials(page: any, account?: string) {
  try {
    const creds = getReserveAmericaCredentials(account);
    if (creds.username && creds.password) {
      console.log(`Credentials found in keychain for ${creds.username}. Pre-filling form...`);
      const emailSelector = 'input[aria-label="Email"], input[placeholder*="user name"], #email';
      const passwordSelector = 'input[aria-label="Password"], input[type="password"]';
      await page.waitForSelector(emailSelector, { timeout: 10000 });
      await page.fill(emailSelector, creds.username);
      await page.fill(passwordSelector, creds.password);
      console.log(`Form pre-filled for ${account || 'default'}. Please manually click Sign In.`);
    } else {
      console.log(`No credentials found in keychain for ${account || 'default'}. Please enter them manually.`);
    }
  } catch (e: any) {
    console.log(`⚠️ Could not auto-fill credentials for ${account || 'default'}: ${e.message}`);
    console.log(`Please enter them manually.`);
  }
}

async function waitForUserCompletion(activeSessions: ActiveSession[]): Promise<boolean> {
  let areBrowsersOpen = true;
  for (const session of activeSessions) {
    session.browser.on('disconnected', () => {
      areBrowsersOpen = false;
    });
  }

  process.stdin.resume();
  await new Promise<void>((resolvePromise) => {
    process.stdin.once('data', () => resolvePromise());
    for (const session of activeSessions) {
      session.browser.on('disconnected', () => resolvePromise());
    }
  });

  return areBrowsersOpen;
}

async function saveSessions(activeSessions: ActiveSession[]) {
  console.log('\nValidating and saving session states...');
  for (const { context, sessionPath } of activeSessions) {
    const page = await context.newPage();
    const isValid = await validateSessionActive(page);
    await page.close();

    if (isValid) {
      await context.storageState({ path: sessionPath });
      console.log(`✅ Session verified and saved to ${sessionPath}.`);
    } else {
      console.error(`❌ Session at ${sessionPath} is INVALID. Skipping save. Did you log in successfully?`);
    }
  }
}

/**
 * Attempts to automatically log in the given accounts using stored keychain credentials.
 * Throws an error if auto-login fails (e.g., due to a CAPTCHA or missing credentials).
 */
export async function performAutoLogin(accounts: string[]): Promise<void> {
  console.log(`\n🔄 Attempting auto-renewal for: ${accounts.join(', ')}`);

  const browsersToClose: any[] = [];

  try {
    for (const account of accounts) {
      const sessionPath = getSessionPath(account);
      const themeArgs = getThemeArgs(account);

      console.log(`[Auto-Login] Launching background headless browser for ${account}...`);
      // Use headless for auto-login to be unobtrusive
      const browser = await chromium.launch({ headless: true, args: themeArgs });
      browsersToClose.push(browser);

      const context = await browser.newContext({ timezoneId: 'America/Denver' });
      const page = await context.newPage();

      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const creds = getReserveAmericaCredentials(account);
      if (!creds.username || !creds.password) {
        throw new Error(`Missing keychain credentials for ${account}. Please run "npm run auth" manually to set them.`);
      }

      console.log(`[Auto-Login] Filling credentials for ${account}...`);
      const emailSelector = 'input[aria-label="Email"], input[placeholder*="user name"], #email';
      const passwordSelector = 'input[aria-label="Password"], input[type="password"]';

      await page.waitForSelector(emailSelector, { timeout: 10000 });
      await page.fill(emailSelector, creds.username);
      await page.fill(passwordSelector, creds.password);

      console.log(`[Auto-Login] Submitting form...`);
      // Find and click the sign in button programmatically
      const submitSelector = 'button[type="submit"]:has-text("Sign In"), button:has-text("Sign in")';
      await page.waitForSelector(submitSelector, { timeout: 5000 });

      // Sometimes React leaves the button disabled because it didn't register the programmatic 'fill' as human typing
      await page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        buttons.forEach(btn => { if (btn) btn.disabled = false });
      });

      try {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(() => { }), // Ignore timeouts due to soft navigations
          page.click(submitSelector)
        ]);
      } catch (navigationError: any) {
        console.warn(`[Auto-Login] Click submission warning: ${navigationError.message}`);
      }

      // Wait a moment for any post-login redirects or CAPTCHAs to settle
      await page.waitForTimeout(4000);

      console.log(`[Auto-Login] Verifying session...`);
      const isValid = await validateSessionActive(page);

      if (!isValid) {
        const errScreenshotPath = `logs/fail-validation-${account}-${Date.now()}.png`;
        await page.screenshot({ path: errScreenshotPath, fullPage: true });
        console.error(`❌ Auto-login failed for ${account}. ReserveAmerica may have blocked the request or required a CAPTCHA. Saved screenshot to ${errScreenshotPath}.`);
        throw new Error('Auto-login failed. Fallback required.');
      }

      await context.storageState({ path: sessionPath });
      console.log(`✅ [Auto-Login] Successfully renewed session for ${account} and saved to ${sessionPath}.`);
    }
  } catch (error: any) {
    console.log(`\n⚠️ Headless auto-login was unable to complete: ${error.message}`);
    console.log(`Falling back to manual authentication window...\n`);
    await setupAuthForAccounts(accounts);
  } finally {
    for (const browser of browsersToClose) {
      await browser.close().catch(() => { });
    }
  }
}

if (require.main === module || (process.argv[1] && process.argv[1].endsWith('auth.ts'))) {
  void setupAuth().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
