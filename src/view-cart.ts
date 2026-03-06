import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());
import { resolve } from 'path';

const CART_URL = 'https://utahstateparks.reserveamerica.com/viewShoppingCart.do';
const SESSION_FILE = 'session.json';

async function viewCart() {
  const sessionPath = resolve(process.cwd(), SESSION_FILE);

  console.log(`Opening browser with session from ${sessionPath}...`);
  console.log('Navigating to your Shopping Cart...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: SESSION_FILE,
    timezoneId: 'America/Denver',
  });
  const page = await context.newPage();

  await page.goto(CART_URL, { waitUntil: 'networkidle' });

  console.log('\n--- Browser is now open! ---');
  console.log('1. Check the "Shopping Cart" page for your held sites.');
  console.log('2. If the cart is empty, check "My Account" -> "Current Reservations".');
  console.log('3. Close the browser or press Ctrl+C here when finished.\n');

  // Keep the script running until the browser is closed
  await new Promise<void>((resolvePromise) => {
    browser.on('disconnected', () => resolvePromise());
  });

  process.exit(0);
}

void viewCart().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
