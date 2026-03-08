import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());
import { resolve } from 'path';
import { getReserveAmericaCredentials } from './keychain';
import * as util from 'util';

const LOGIN_URL = 'https://utahstateparks.reserveamerica.com/memberSignIn.do';

const { values } = util.parseArgs({
  args: process.argv.slice(2),
  options: {
    user: { type: 'string', short: 'u' },
  },
  strict: false,
});

const userAccount = typeof values.user === 'string' ? values.user : undefined;
const SESSION_FILE = userAccount ? `session-${userAccount.split('@')[0]}.json` : 'session.json';

async function setupAuth() {
  const sessionPath = resolve(process.cwd(), SESSION_FILE);

  console.log('--- Manual Authentication Mode ---');
  console.log('1. A browser window will open.');
  console.log('2. Log in manually to your ReserveAmerica account.');
  console.log('3. Once you are logged in and see your dashboard/account, come back here.');
  console.log('4. Press Enter in this terminal to save the session and exit.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    timezoneId: 'America/Denver',
  });
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  try {
    const creds = getReserveAmericaCredentials(userAccount);
    if (creds.username && creds.password) {
      console.log(`Credentials found in keychain for ${creds.username}. Pre-filling form...`);
      const emailSelector = 'input[aria-label="Email"], input[placeholder*="user name"], #email';
      const passwordSelector = 'input[aria-label="Password"], input[type="password"]';
      await page.waitForSelector(emailSelector, { timeout: 10000 });
      await page.fill(emailSelector, creds.username);
      await page.fill(passwordSelector, creds.password);
      console.log('Form pre-filled. Please manually click Sign In or press Enter in the browser.');
    } else {
      console.log('No credentials found in keychain. Please enter them manually.');
    }
  } catch (e) {
    console.log('Could not auto-fill credentials. Please enter them manually.');
  }

  let isBrowserOpen = true;
  browser.on('disconnected', () => {
    isBrowserOpen = false;
  });

  process.stdin.resume();
  await new Promise<void>((resolvePromise) => {
    process.stdin.once('data', () => resolvePromise());
    browser.on('disconnected', () => resolvePromise());
  });

  if (isBrowserOpen) {
    console.log('Saving session state...');
    await context.storageState({ path: SESSION_FILE });
    console.log(`✅ Session saved to ${sessionPath}.`);
  } else {
    console.log('Browser was closed before session could be saved.');
  }

  await browser.close().catch(() => { });
  process.exit(0);
}

void setupAuth().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
