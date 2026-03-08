import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
import { resolve } from 'path';
import * as fs from 'fs';

const SESSION_FILE = 'session.json';
const PARK_URL = 'https://utahstateparks.reserveamerica.com/campgroundDetails.do?contractCode=UT&parkId=343061';

async function testSession() {
    if (!fs.existsSync(SESSION_FILE)) {
        console.error('No session.json found!');
        return;
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        storageState: SESSION_FILE,
        timezoneId: 'America/Denver',
    });

    const page = await context.newPage();

    await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });

    const html = await page.content();
    if (html.includes('Sign Out') || html.includes('My Account')) {
        console.log('✅ STILL LOGGED IN');
    } else {
        console.log('❌ SESSION INVALIDATED');
    }

    await context.close();
    await browser.close();
}

testSession().catch(console.error);
