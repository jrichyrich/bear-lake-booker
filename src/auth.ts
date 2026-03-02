import { chromium } from 'playwright';

async function setupAuth() {
  console.log('🔓 Opening browser for manual login...');
  console.log('1. Log in to ReserveAmerica/Utah State Parks.');
  console.log('2. Once you are logged in and see your dashboard, close the browser or press Enter here.');

  const browser = await chromium.launch({ headless: false }); // Must be visible for you to log in
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://utahstateparks.reserveamerica.com/memberSignIn.do');

  // Wait for the user to finish (either by closing the browser or pressing enter in CLI)
  process.stdin.resume();
  await new Promise(resolve => {
    process.stdin.once('data', resolve);
    browser.on('disconnected', resolve);
  });

  // Save the state (cookies, local storage)
  await context.storageState({ path: 'session.json' });
  console.log('✅ Session saved to session.json!');

  await browser.close();
  process.exit(0);
}

setupAuth();
