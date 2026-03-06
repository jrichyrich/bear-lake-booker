import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());
import { resolve } from 'path';
import { getReserveAmericaCredentials } from './keychain';

const LOGIN_URL = 'https://utahstateparks.reserveamerica.com/memberSignIn.do';
const SESSION_FILE = 'session.json';

async function setupAuth() {
  const sessionPath = resolve(process.cwd(), SESSION_FILE);
  const credentials = getReserveAmericaCredentials();

  console.log('Opening browser for login...');
  if (credentials.password) {
    console.log(`Retrieved credentials for ${credentials.username} from keychain. Attempting automated login...`);
  } else {
    console.log('No credentials found in keychain. Falling back to manual login.');
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    timezoneId: 'America/Denver',
  });
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  if (credentials.password) {
    try {
      // Automate filling the login form
      await page.waitForSelector('input[aria-label="Email"], #AEmailAddress, #email');
      await page.fill('input[aria-label="Email"], #AEmailAddress, #email', credentials.username);
      await page.fill('input[aria-label="Password"], #APassword, #password', credentials.password);

      // Look for the sign-in button
      const signInButton = page.locator('button:has-text("Sign In"), input[type="submit"][value="Sign In"]').first();
      if (await signInButton.count() > 0) {
        // Wait for the button to be enabled (some forms might disable it until fields are validated)
        await signInButton.waitFor({ state: 'visible', timeout: 5000 });

        // Wait for it to become enabled if it's disabled
        try {
          await page.waitForFunction((btn) => !(btn as HTMLButtonElement).disabled, await signInButton.elementHandle(), { timeout: 5000 });
        } catch (e) {
          console.log('Sign-in button still disabled, attempting click anyway...');
        }

        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => { }),
          signInButton.click({ force: true }), // Use force if still disabled/covered but logic allows
        ]);
        console.log('Login form submitted.');
      }
    } catch (error) {
      console.error('Automated login failed, please complete manually:', error instanceof Error ? error.message : String(error));
    }
  }

  console.log(`A Playwright storage state file will be written to ${sessionPath}.`);
  console.log('1. Ensure you are fully logged in to ReserveAmerica / Utah State Parks.');
  console.log('2. Once logged in, press Enter here or close the browser window.');

  // Periodically save storage state so that closing the browser always
  // yields a valid session.json (storageState fails after disconnect).
  let isBrowserOpen = true;
  const saveInterval = setInterval(async () => {
    try {
      await context.storageState({ path: SESSION_FILE });
    } catch {
      // Context may be closed already — that's fine, the last save wins.
    }
  }, 3000);

  browser.on('disconnected', () => {
    isBrowserOpen = false;
  });

  process.stdin.resume();
  await new Promise<void>((resolvePromise) => {
    process.stdin.once('data', () => resolvePromise());
    browser.on('disconnected', () => resolvePromise());
  });

  clearInterval(saveInterval);

  if (isBrowserOpen) {
    await context.storageState({ path: SESSION_FILE });
  }

  console.log(`Session saved to ${sessionPath}.`);

  await browser.close().catch(() => { });
  process.exit(0);
}

void setupAuth().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
