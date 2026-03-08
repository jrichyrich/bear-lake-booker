import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());

import { parseArgs } from 'util';
import { searchAvailability } from './reserveamerica';
import { notifySuccess } from './notify';
import { getSessionPath, startHeartbeat, sessionExists, getSessionExpiryInfo } from './session-utils';
import { performAutoLogin } from './auth';
import { PARK_URL } from './config';
import { assertBookingWindow, getDynamicMaxDate, getDynamicRandomDate } from './timer-utils';

const { values } = parseArgs({
  options: {
    date: { type: 'string', short: 'd', default: '07/08/2026' },
    length: { type: 'string', short: 'l', default: '6' },
    loop: { type: 'string', short: 'o', default: 'BIRCH' },
    monitorInterval: { type: 'string', short: 'i' },
  },
});

let TARGET_DATE = values.date!;
const STAY_LENGTH = values.length!;
const LOOP = values.loop!;
const INTERVAL_MINS = values.monitorInterval ? parseInt(values.monitorInterval, 10) : null;

if (TARGET_DATE.toLowerCase() === 'max') {
  TARGET_DATE = getDynamicMaxDate();
  console.log(`Dynamic date 'max' resolved to: ${TARGET_DATE}`);
} else if (TARGET_DATE.toLowerCase() === 'random') {
  TARGET_DATE = getDynamicRandomDate();
  console.log(`Dynamic date 'random' resolved to: ${TARGET_DATE}`);
}

async function main() {
  console.log(`\n--- Bear Lake Monitoring Mode ---`);
  console.log(`Target: ${TARGET_DATE} (${STAY_LENGTH} nights) in ${LOOP} loop`);

  const { isExpired, earliestExpiry } = getSessionExpiryInfo(undefined);

  if (isExpired) {
    console.log(`⚠️  WARNING: Default session file is expired or missing. Attempting auto-login...`);
    try {
      await performAutoLogin([]);
    } catch (e: any) {
      console.error(`❌ Auto-login failed: ${e.message}`);
      process.exit(1);
    }
  } else if (earliestExpiry) {
    console.log(`Session valid until: ${earliestExpiry.toLocaleString()}`);
  }

  // Optional: Background heartbeat to keep session alive during long monitoring
  if (INTERVAL_MINS && sessionExists()) {
    console.log('Initializing background heartbeat to keep session active...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: getSessionPath() });
    const page = await context.newPage();
    await startHeartbeat(page, '[Heartbeat] ');
  }

  if (INTERVAL_MINS) {
    console.log(`Polling every ${INTERVAL_MINS} minute(s)...`);
    for (; ;) {
      await checkAvailability();
      await sleep(INTERVAL_MINS * 60_000);
    }
  } else {
    await checkAvailability();
  }
}

async function checkAvailability() {
  assertBookingWindow(TARGET_DATE);

  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] Checking Bear Lake (${LOOP} loop) for ${TARGET_DATE} (${STAY_LENGTH} nights)...`);

  try {
    const result = await searchAvailability({
      date: TARGET_DATE,
      length: STAY_LENGTH,
      loop: LOOP,
    });

    if (result.exactDateMatches.length > 0) {
      const sites = result.exactDateMatches.map((site) => site.site);
      notifySuccess(sites, null, 'monitoring', TARGET_DATE, LOOP, STAY_LENGTH);
      return;
    }

    if (result.availableSites.length > 0) {
      const nearbyDates = Array.from(
        new Set(result.availableSites.flatMap((site) => site.availableDates)),
      );
      console.log(`No sites available for the exact arrival date ${TARGET_DATE}.`);
      console.log(`Nearby arrival dates with openings: ${nearbyDates.join(', ')}`);
      return;
    }

    console.log(`No availability found for ${TARGET_DATE} or nearby dates in the current window.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Search failed: ${message}`);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
