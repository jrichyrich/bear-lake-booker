import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

import { parseArgs } from 'util';
import { getThemeArgs } from './theme';
import { getSessionPath, validateSessionActive, sessionExists } from './session-utils';
import { PARK_URL } from './config';

const CART_URL = 'https://utahstateparks.reserveamerica.com/viewShoppingCart.do';

const { values } = parseArgs({
  options: {
    accounts: { type: 'string', short: 'a' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(`
Bear Lake Booker - Shopping Cart Viewer

Usage:
  npm run view-cart -- [options]

Options:
  -a, --accounts <csv>  Comma-separated list of account names (e.g. lisa,jason)
  -h, --help            Show help
  `);
  process.exit(0);
}

/**
 * Opens a single account's shopping cart in a themed browser window.
 */
async function openAccountCart(accountName: string) {
  const sessionPath = getSessionPath(accountName.includes('@') ? accountName : `${accountName}@gmail.com`);

  if (!sessionExists(accountName.includes('@') ? accountName : `${accountName}@gmail.com`)) {
    console.error(`❌ No session file found for ${accountName} at ${sessionPath}`);
    return;
  }

  const themeArgs = getThemeArgs(accountName);
  const browser = await chromium.launch({ headless: false, args: themeArgs });
  const context = await browser.newContext({
    storageState: sessionPath,
    timezoneId: 'America/Denver',
  });

  const page = await context.newPage();
  console.log(`[${accountName}] Verifying session...`);
  
  if (await validateSessionActive(page)) {
    console.log(`[${accountName}] ✅ Session verified as ACTIVE. Loading Shopping Cart...`);
    await page.goto(CART_URL);
  } else {
    console.error(`[${accountName}] ❌ Session expired! Run "npm run auth -u ${accountName}" to refresh.`);
  }

  // Keep this specific browser open until closed by user
  await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
  await browser.close().catch(() => {});
}

async function main() {
  const accountList = values.accounts 
    ? values.accounts.split(',').map(s => s.trim()) 
    : [undefined]; // Use default session if no accounts provided

  console.log('--- Bear Lake Booker: Shopping Cart Viewer ---');
  
  if (accountList[0] === undefined) {
    console.log('Opening default shopping cart...');
    await openAccountCart('default');
  } else {
    console.log(`Opening carts for: ${accountList.join(', ')}...`);
    await Promise.all(accountList.map(acc => openAccountCart(acc!)));
  }

  console.log('\nAll requested windows closed.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});
