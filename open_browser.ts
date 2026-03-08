import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
import { resolve } from 'path';
import * as fs from 'fs';

const SESSION_FILE = 'session.json';
const PARK_URL = 'https://utahstateparks.reserveamerica.com/campgroundDetails.do?contractCode=UT&parkId=343061';
const CART_URL = 'https://utahstateparks.reserveamerica.com/shoppingCart.do';

async function openSession() {
    if (!fs.existsSync(SESSION_FILE)) {
        console.error('No session.json found!');
        return;
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        storageState: SESSION_FILE,
        timezoneId: 'America/Denver',
    });

    const page = await context.newPage();

    console.log('Navigating to ReserveAmerica to attach session...');
    await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });

    const html = await page.content();
    if (html.includes('Sign Out') || html.includes('My Account')) {
        console.log('✅ Confirmed logged in based on page content.');
    } else {
        console.log('⚠️ Does not look logged in. Session was definitely invalidated by ReserveAmerica.');
    }

    console.log('Opening shopping cart...');
    await page.goto(CART_URL);

    console.log('Browser is open! Close the browser window when you are done.');
    await page.waitForEvent('close', { timeout: 0 });
    await context.close();
    await browser.close();
}

openSession().catch(console.error);
