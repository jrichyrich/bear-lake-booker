const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://utahstateparks.reserveamerica.com/memberSignIn.do', {waitUntil: 'domcontentloaded'});
  const html = await page.content();
  
  // Find inputs in the form
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(input => ({
      id: input.id,
      name: input.name,
      type: input.type,
      placeholder: input.placeholder,
      ariaLabel: input.getAttribute('aria-label')
    }));
  });
  console.log(JSON.stringify(inputs, null, 2));
  await browser.close();
})();
