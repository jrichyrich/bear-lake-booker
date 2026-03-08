const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://utahstateparks.reserveamerica.com/memberSignIn.do', { waitUntil: 'domcontentloaded' });
  
  const htmls = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(i => i.outerHTML);
  });
  console.log('INPUTS:', htmls.join('\n'));
  
  await browser.close();
})();
