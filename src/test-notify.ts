import { execSync } from 'child_process';

const TARGET_DATE = "07/22/2026";
const STAY_LENGTH = "6";
const LOOP = "BIRCH";

/**
 * TEST VERSION of notifySuccess
 */
function notifySuccess(count: number) {
  const message = `🧪 TEST: Bear Lake Booker found ${count} available slots for ${TARGET_DATE} in ${LOOP} loop!`;
  const recipient = "richards_jason@me.com";

  console.log("🔔 Triggering TEST notifications...");

  // 1. Desktop Notification
  try {
    const escapedMsg = message.replace(/"/g, '"');
    execSync(`osascript -e 'display notification "${escapedMsg}" with title "Bear Lake Booker TEST" sound name "Crystal"'`);
    console.log("✅ Desktop notification triggered.");
  } catch (e) {
    console.warn("⚠️ Failed to send desktop notification.");
  }

  // 2. iMessage
  try {
    const escapedMsg = message.replace(/"/g, '"');
    execSync(`osascript -e 'tell application "Messages" to send "${escapedMsg}" to buddy "${recipient}"'`);
    console.log(`📩 iMessage test sent to ${recipient}`);
  } catch (e) {
    console.warn("⚠️ Failed to send iMessage. Ensure Messages.app is signed in.");
  }
}

// Trigger a test success with 3 slots
notifySuccess(3);
