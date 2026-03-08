import { chromium } from 'playwright-extra';
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
import * as fs from 'fs';

const SESSION_FILE = 'session.json';
const CART_URL = 'https://utahstateparks.reserveamerica.com/shoppingCart.do';
const PARK_URL = 'https://utahstateparks.reserveamerica.com/campgroundDetails.do?contractCode=UT&parkId=343061';

async function displayHolds() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.error('No session file found!'); return;
  }
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: SESSION_FILE,
    timezoneId: 'America/Denver'
  });
  
  const page = await context.newPage();
  
  console.log('Verifying session at ReserveAmerica root...');
  await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });
  
  const html = await page.content();
  if (html.includes('Sign Out') || html.includes('My Account')) {
    console.log('✅ Session active! Going to Shopping Cart...');
    await page.goto(CART_URL);
    console.log('Browser is open with cart loaded. Keep window open.');
    await page.waitForEvent('close', { timeout: 0 });
  } else {
    console.error('❌ That session expired! When ReserveAmerica agents abandon carts or time out, the session is invalidated by the server. Try npm run auth again to see a fresh cart.');
  }

  await context.close();
  await browser.close();
}

displayHolds().catch(console.error);
