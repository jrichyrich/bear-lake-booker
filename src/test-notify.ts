import { execFileSync } from 'child_process';
import { buildIMessageAppleScript, normalizeIMessageRecipient } from './notify';

const TARGET_DATE = "07/22/2026";
const STAY_LENGTH = "6";
const LOOP = "BIRCH";
const RECIPIENT = normalizeIMessageRecipient(process.env.TEST_IMESSAGE_RECIPIENT ?? '');

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
  if (!RECIPIENT) {
    console.warn("⚠️ TEST_IMESSAGE_RECIPIENT is not set. Skipping iMessage test.");
  } else {
    try {
      execFileSync('osascript', buildIMessageAppleScript(message, RECIPIENT).flatMap((line) => ['-e', line]));
      console.log(`📩 iMessage test sent to ${RECIPIENT}`);
    } catch (e) {
      console.warn(`⚠️ Failed to send iMessage. ${e instanceof Error ? e.message : 'Ensure Messages.app is signed in.'}`);
    }
  }
}

// Trigger a test success with 3 slots
notifySuccess(3);
