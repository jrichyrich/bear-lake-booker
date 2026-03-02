import { execSync } from 'child_process';
import { parseArgs } from 'util';

/**
 * Bear Lake Booker CLI
 * 
 * This tool automates checking for campsite availability at Bear Lake State Park.
 */

const PARK_URL = "https://utahstateparks.reserveamerica.com/camping/bear-lake-state-park/r/campgroundDetails.do?contractCode=UT&parkId=343061";

// Configuration from CLI
const { values } = parseArgs({
  options: {
    date: { type: 'string', short: 'd', default: "07/22/2026" },
    length: { type: 'string', short: 'l', default: "6" },
    loop: { type: 'string', short: 'o', default: "BIRCH" },
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
const INTERVAL_MINS = values.interval ? parseInt(values.interval) : null;

function checkAvailability() {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] 🚀 Checking Bear Lake (${LOOP} loop) for ${TARGET_DATE} (${STAY_LENGTH} nights)...`);

  try {
    // 1. Open the page and set parameters
    console.log("Navigating to reservation page...");
    execSync(`agent-browser open "${PARK_URL}"`);
    
    // Using explicit CSS IDs for maximum reliability
    console.log(`Selecting ${LOOP} loop...`);
    execSync(`agent-browser select "#loop" "${LOOP}"`);
    
    console.log(`Setting dates to ${TARGET_DATE}...`);
    execSync(`agent-browser fill "#arrivaldate" "${TARGET_DATE}"`);
    execSync(`agent-browser fill "#lengthOfStay" "${STAY_LENGTH}"`);
    
    console.log("Searching...");
    execSync(`agent-browser click "#btnsearch"`);
    
    // 2. Wait for results and check the calendar
    console.log("Waiting for results...");
    execSync(`agent-browser wait 5000`);
    
    const calendarText = execSync(`agent-browser get text "#calendar"`).toString();
    
    // 3. Analyze results (Count 'A' for Available)
    const availableCount = (calendarText.match(/A/g) || []).length;
    
    if (availableCount > 0) {
      console.log(`✅ SUCCESS! Found ${availableCount} available slots!`);
      notifySuccess(availableCount);
    } else {
      console.log("❌ No availability found. Still fully booked (X).");
    }
    
  } catch (error) {
    // Fallback: If IDs fail, try to find by label again but more specifically
    console.log("⚠️ IDs failed, trying label fallback...");
    try {
      execSync(`agent-browser select "role=combobox[name='Loop']" "${LOOP}"`);
      execSync(`agent-browser fill "role=textbox[name='Arrival date']" "${TARGET_DATE}"`);
      execSync(`agent-browser fill "role=spinbutton[name='Length of stay:']" "${STAY_LENGTH}"`);
      execSync(`agent-browser click "role=button[name='Search Available']"`);
      execSync(`agent-browser wait 5000`);
      // ... analyze as above
    } catch (fallbackError) {
      console.error("❌ Both ID and label selectors failed.");
      try {
        const snapshotName = `failure-${Date.now()}.png`;
        console.log(`📸 Saving failure snapshot to ${snapshotName}...`);
        execSync(`agent-browser snapshot "${snapshotName}"`);
      } catch (snapshotErr) {
        // Ignore snapshot failures
      }
    }
  }
}

/**
 * Sends a native macOS notification and an iMessage when a spot is found.
 */
function notifySuccess(count: number) {
  const message = `✅ Bear Lake Booker: Found ${count} available slots for ${TARGET_DATE} (${STAY_LENGTH} nights) in ${LOOP} loop!`;
  const recipient = "richards_jason@me.com";

  console.log("🔔 Triggering notifications...");

  // 1. Desktop Notification
  try {
    const escapedMsg = message.replace(/"/g, '\\"');
    execSync(`osascript -e 'display notification "${escapedMsg}" with title "Bear Lake Booker" sound name "Crystal"'`);
  } catch (e) {
    console.warn("⚠️ Failed to send desktop notification.");
  }

  // 2. iMessage
  try {
    const escapedMsg = message.replace(/"/g, '\\"');
    execSync(`osascript -e 'tell application "Messages" to send "${escapedMsg}" to buddy "${recipient}"'`);
    console.log(`📩 iMessage sent to ${recipient}`);
  } catch (e) {
    console.warn("⚠️ Failed to send iMessage. Ensure Messages.app is signed in.");
  }
}

// Run the check
if (INTERVAL_MINS) {
  console.log(`🔄 Continuous monitoring enabled: Running every ${INTERVAL_MINS} minutes.`);
  checkAvailability();
  setInterval(checkAvailability, INTERVAL_MINS * 60 * 1000);
} else {
  checkAvailability();
}
