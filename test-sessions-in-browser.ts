import { chromium } from 'playwright-extra';
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

async function run() {
  const accounts = ['lisarichards1984', 'jrichards1981'];
  
  for (const acc of accounts) {
    const sessionFile = `.sessions/session-${acc}.json`;
    console.log(`Opening browser for ${acc} using ${sessionFile}...`);
    
    // Launch a visible browser loaded with the session cookies/storage
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: sessionFile });
    const page = await context.newPage();
    
    // Go directly to the "My Reservations" page to prove we are logged in
    await page.goto('https://utahstateparks.reserveamerica.com/myAccount.do', { waitUntil: 'domcontentloaded' });
    
    console.log(`Browser opened for ${acc}. It will stay open so you can verify the login state.`);
  }
}

run().catch(console.error);
