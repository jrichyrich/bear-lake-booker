import { chromium } from 'playwright';
import { PARK_URL } from './config';
import { getSessionPath, isSessionValid, sessionExists } from './session-utils';

async function checkSession() {
  const sessionPath = getSessionPath();
  if (!sessionExists()) {
    console.error(`Error: ${sessionPath} not found.`);
    process.exit(1);
  }

  console.log('Checking session validity...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: sessionPath,
    timezoneId: 'America/Denver',
  });
  const page = await context.newPage();

  try {
    await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });

    if (await isSessionValid(page)) {
      console.log('✅ Session is VALID. You are logged in.');
      
      const bodyText = await page.textContent('body') || '';
      const userMatch = bodyText.match(/Welcome,\s+([^!|]+)/i);
      if (userMatch && userMatch[1]) {
        console.log(`Logged in as: ${userMatch[1].trim()}`);
      }
    } else {
      console.log('❌ Session is INVALID or EXPIRED. You are not logged in.');
    }
  } catch (error) {
    console.error('Error checking session:', error instanceof Error ? error.message : String(error));
  } finally {
    await browser.close();
  }
}

void checkSession();
