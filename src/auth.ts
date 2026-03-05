import { chromium } from 'playwright';
import { resolve } from 'path';

const LOGIN_URL = 'https://utahstateparks.reserveamerica.com/memberSignIn.do';
const SESSION_FILE = 'session.json';

async function setupAuth() {
  const sessionPath = resolve(process.cwd(), SESSION_FILE);

  console.log('Opening browser for manual login...');
  console.log(`A Playwright storage state file will be written to ${sessionPath}.`);
  console.log('1. Sign in to ReserveAmerica / Utah State Parks in the opened browser.');
  console.log('2. Once you are fully logged in, press Enter here or close the browser window.');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    timezoneId: 'America/Denver',
  });
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

  process.stdin.resume();
  await new Promise<void>((resolvePromise) => {
    process.stdin.once('data', () => resolvePromise());
    browser.on('disconnected', () => resolvePromise());
  });

  await context.storageState({ path: SESSION_FILE });
  console.log(`Session saved to ${sessionPath}.`);
  console.log('Next step: run `npm run race -- -m 5 -c 4 --book` or ask me to smoke-test with that session.');

  await browser.close().catch(() => {});
  process.exit(0);
}

void setupAuth().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
