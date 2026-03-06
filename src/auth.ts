import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());
import { resolve } from 'path';

const LOGIN_URL = 'https://utahstateparks.reserveamerica.com/memberSignIn.do';
const SESSION_FILE = 'session.json';

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
