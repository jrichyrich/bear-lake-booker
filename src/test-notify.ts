import { execFileSync } from 'child_process';
import { RECIPIENT } from './config';

const TARGET_DATE = "07/22/2026";
const STAY_LENGTH = "6";
const LOOP = "BIRCH";

/**
 * TEST VERSION of notifySuccess
 */
function notifySuccess(count: number) {
  const message = `🧪 TEST: Bear Lake Booker found ${count} available slots for ${TARGET_DATE} in ${LOOP} loop!`;

  console.log("🔔 Triggering TEST notifications...");

  const escapedMsg = message.replace(/"/g, '\\"');

  // 1. Desktop Notification
  try {
    execFileSync('osascript', ['-e', `display notification "${escapedMsg}" with title "Bear Lake Booker TEST" sound name "Crystal"`]);
    console.log("✅ Desktop notification triggered.");
  } catch (e) {
    console.warn("⚠️ Failed to send desktop notification.");
  }

  // 2. iMessage
  try {
    execFileSync('osascript', ['-e', `tell application "Messages" to send "${escapedMsg}" to buddy "${RECIPIENT}"`]);
    console.log(`📩 iMessage test sent to ${RECIPIENT}`);
  } catch (e) {
    console.warn("⚠️ Failed to send iMessage. Ensure Messages.app is signed in.");
  }
}

// Trigger a test success with 3 slots
notifySuccess(3);
