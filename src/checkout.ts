import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
import { resolve } from 'path';
import * as fs from 'fs';
import { getThemeArgs } from './theme';

const CART_URL = 'https://utahstateparks.reserveamerica.com/shoppingCart.do';

async function openCart(accountName: string, color: string) {
    const sessionFile = `session-${accountName}.json`;
    const sessionPath = resolve(process.cwd(), sessionFile);

    if (!fs.existsSync(sessionPath)) {
        console.log(`❌ Session file not found for ${accountName}`);
        return;
    }

    const themeArgs = getThemeArgs(accountName);
    const browser = await chromium.launch({ headless: false, args: themeArgs });
    const context = await browser.newContext({
        storageState: sessionPath,
        timezoneId: 'America/Denver',
    });

    const page = await context.newPage();
    console.log(`Opening Shopping Cart for ${accountName}...`);
    await page.goto(CART_URL);
}

async function main() {
    console.log('--- Bear Lake Booker: Manual Checkout ---');
    // Launch both browsers concurrently
    await Promise.all([
        openCart('lisarichards1984', '#E91E63'), // Pink
        openCart('jrichards1981', '#2196F3')     // Blue
    ]);
    console.log('\n✅ Carts are open! You may now manually enter payment information on both screens.');
    console.log('Press Ctrl+C in this terminal when you are finished checkout out.');
}

main().catch(console.error);
