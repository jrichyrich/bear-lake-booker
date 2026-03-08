import { spawn } from 'child_process';
import { RECIPIENT } from './config';

export type SuccessStage = 'site-details' | 'order-details' | 'monitoring';

interface NotificationContent {
  title: string;
  message: string;
  agentLabel: string;
}

/**
 * Formats the notification content based on the success stage.
 */
function formatContent(
  siteId: string | string[],
  agentId: number | null,
  stage: SuccessStage,
  targetDate: string,
  loop: string,
  stayLength?: string
): NotificationContent {
  let message = '';
  let title = 'Bear Lake Booker: CAPTURE';

  if (stage === 'monitoring') {
    const sites = Array.isArray(siteId) ? siteId : [siteId];
    message = `Found ${sites.length} site(s) for ${targetDate} (${stayLength} nights) in ${loop}: ${sites.join(', ')}`;
    title = 'Bear Lake Booker: MONITOR';
  } else {
    const stageLabel = stage === 'order-details' ? 'reached Order Details for' : 'opened site details for';
    message = `Agent ${agentId} ${stageLabel} site ${siteId} for ${targetDate} in ${loop}.`;
  }

  return {
    title,
    message: `Bear Lake Booker: ${message}`,
    agentLabel: agentId !== null ? `[Agent ${agentId}] ` : '',
  };
}

/**
 * Sends a macOS desktop notification asynchronously.
 */
function sendDesktopNotification(content: NotificationContent) {
  // Sanitize message for AppleScript double-quote enclosure
  const sanitized = content.message.replace(/["\\]/g, ''); 
  
  const process = spawn('osascript', [
    '-e', 
    `display notification "${sanitized}" with title "${content.title}" sound name "Glass"`
  ]);

  process.on('error', () => {
    console.warn(`${content.agentLabel}Desktop notification failed to spawn.`);
  });
}

/**
 * Sends an iMessage asynchronously.
 */
function sendIMessage(content: NotificationContent) {
  const sanitized = content.message.replace(/["\\]/g, '');

  const process = spawn('osascript', [
    '-e', 
    `tell application "Messages" to send "${sanitized}" to buddy "${RECIPIENT}"`
  ]);

  process.on('error', () => {
    console.warn(`${content.agentLabel}iMessage failed to spawn.`);
  });

  process.on('exit', (code) => {
    if (code === 0) {
      console.log(`${content.agentLabel}iMessage sent to ${RECIPIENT}`);
    } else {
      console.warn(`${content.agentLabel}iMessage failed with exit code ${code}.`);
    }
  });
}

/**
 * Orchestrates multi-channel notifications for successful events.
 */
export function notifySuccess(
  siteId: string | string[],
  agentId: number | null,
  stage: SuccessStage,
  targetDate: string,
  loop: string,
  stayLength?: string
) {
  const content = formatContent(siteId, agentId, stage, targetDate, loop, stayLength);
  
  // 1. Console Log
  console.log(`\n${content.agentLabel}${content.message}`);

  // 2. Desktop Notification
  sendDesktopNotification(content);

  // 3. iMessage
  sendIMessage(content);
}
