import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());
import { getReserveAmericaCredentials } from './keychain';
import * as util from 'util';
import { getThemeArgs } from './theme';
import { getSessionFile, getSessionPath, validateSessionActive } from './session-utils';

const LOGIN_URL = 'https://utahstateparks.reserveamerica.com/memberSignIn.do';

const { values } = util.parseArgs({
  args: process.argv.slice(2),
  options: {
    user: { type: 'string', short: 'u' },
  },
  strict: false,
});

const userAccounts = typeof values.user === 'string' ? values.user.split(',').map(s => s.trim()) : [];

type ActiveSession = { browser: any, context: any, sessionFile: string, sessionPath: string };

async function setupAuth() {
  console.log('--- Manual Authentication Mode ---');
  console.log('1. A browser window will open for each account.');
  console.log('2. Log in manually to your ReserveAmerica accounts.');
  console.log('3. Once you are logged in and see your dashboard/account in all windows, come back here.');
  console.log('4. Press Enter in this terminal to save all sessions and exit.\\n');

  const usersToAuth = userAccounts.length > 0 ? userAccounts : [undefined];
  const activeSessions: ActiveSession[] = await Promise.all(usersToAuth.map(launchBrowserForAccount));

  const areBrowsersOpen = await waitForUserCompletion(activeSessions);

  if (areBrowsersOpen) {
    await saveSessions(activeSessions);
  } else {
    console.log('A browser was closed before sessions could be saved.');
  }

  await Promise.all(activeSessions.map(s => s.browser.close().catch(() => { })));
  process.exit(0);
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
  } catch (e) {
    console.log(`Could not auto-fill credentials for ${account || 'default'}. Please enter them manually.`);
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

void setupAuth().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
