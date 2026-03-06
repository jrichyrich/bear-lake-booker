import { execSync } from 'child_process';
import { parseArgs } from 'util';
import { searchAvailability } from './reserveamerica';
import { RECIPIENT } from './config';

const { values } = parseArgs({
  options: {
    date: { type: 'string', short: 'd', default: '07/22/2026' },
    length: { type: 'string', short: 'l', default: '6' },
    loop: { type: 'string', short: 'o', default: 'BIRCH' },
    interval: { type: 'string', short: 'i' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(`
Bear Lake Booker CLI

Usage:
  npx tsx src/index.ts [options]

Options:
  -d, --date <string>     Target arrival date (MM/DD/YYYY) [default: 07/22/2026]
  -l, --length <string>   Length of stay in nights [default: 6]
  -o, --loop <string>     Campground loop name [default: BIRCH]
  -i, --interval <string> Run every X minutes (e.g., -i 5)
  -h, --help              Show this help message
  `);
  process.exit(0);
}

const TARGET_DATE = values.date!;
const STAY_LENGTH = values.length!;
const LOOP = values.loop!;
const INTERVAL_MINS = values.interval ? parseInt(values.interval, 10) : null;

async function main() {
  if (INTERVAL_MINS) {
    console.log(`Continuous monitoring enabled: running every ${INTERVAL_MINS} minutes.`);

    for (; ;) {
      await checkAvailability();
      await sleep(INTERVAL_MINS * 60_000);
    }
  } else {
    await checkAvailability();
  }
}

async function checkAvailability() {
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
      console.log(`Availability found for ${TARGET_DATE}: ${sites.length} site(s) can start that day.`);
      console.log(`Sites: ${sites.join(', ')}`);
      notifySuccess(sites);
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

function notifySuccess(sites: string[]) {
  const message = `Bear Lake Booker: Found ${sites.length} site(s) for ${TARGET_DATE} (${STAY_LENGTH} nights) in ${LOOP}: ${sites.join(', ')}`;

  console.log('Triggering notifications...');

  try {
    const escaped = message.replace(/"/g, '\\"');
    execSync(`osascript -e 'display notification "${escaped}" with title "Bear Lake Booker" sound name "Crystal"'`);
  } catch {
    console.warn('Desktop notification failed.');
  }

  try {
    const escaped = message.replace(/"/g, '\\"');
    execSync(`osascript -e 'tell application "Messages" to send "${escaped}" to buddy "${RECIPIENT}"'`);
    console.log(`iMessage sent to ${RECIPIENT}`);
  } catch {
    console.warn('iMessage failed. Ensure Messages.app is signed in.');
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
