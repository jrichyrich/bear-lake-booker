import { chromium } from 'playwright-extra';
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
import * as fs from 'fs';
import { resolve } from 'path';

const SESSION_FILE = 'session.json';
const PARK_URL = 'https://utahstateparks.reserveamerica.com/campgroundDetails.do?contractCode=UT&parkId=343061';
const CART_URL = 'https://utahstateparks.reserveamerica.com/shoppingCart.do';

async function openSession() {
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
  if (html.includes('Sign Out')) {
    console.log('✅ Session active (Sign Out found)! Going to Shopping Cart...');
    await page.goto(CART_URL);
    console.log('Browser is open with cart loaded. Keep window open.');
    await page.waitForEvent('close', { timeout: 0 });
  } else {
    console.error('❌ That session expired (Sign Out not found on page)! The server has invalidated this session. You will need to run `npm run auth` again.');
    await page.waitForEvent('close', { timeout: 0 });
  }

  await context.close();
  await browser.close();
}

openSession().catch(console.error);
