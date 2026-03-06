import { chromium } from 'playwright';
import * as fs from 'fs';
import { PARK_URL, SESSION_FILE } from './config';

async function checkSession() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.error(`Error: ${SESSION_FILE} not found.`);
    process.exit(1);
  }

  console.log('Checking session validity...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: SESSION_FILE,
    timezoneId: 'America/Denver',
  });
  const page = await context.newPage();

  try {
    // Go to the park URL or a page that requires login/shows account info
    await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });

    // Look for common "logged in" indicators like "Sign Out" or "My Account"
    const bodyText = await page.textContent('body') || '';
    const isLoggedIn = bodyText.includes('Sign Out') || bodyText.includes('My Account') || bodyText.includes('Member Sign Out');

    if (isLoggedIn) {
      console.log('✅ Session is VALID. You are logged in.');
      
      // Try to find the username if possible
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
