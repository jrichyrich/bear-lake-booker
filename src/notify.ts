import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { SESSION_DIR } from './config';
import { type RunSummary } from './reporter';

export type SuccessStage = 'site-details' | 'order-details' | 'monitoring';
export type NotificationProfile = 'test' | 'production';

interface NotificationContent {
  title: string;
  message: string;
  agentLabel: string;
}

type AppleScriptLine = string;

type NotificationRecipientsConfig = {
  test?: {
    imessageRecipients?: string[];
  };
  production?: {
    imessageRecipients?: string[];
  };
};

const NOTIFICATION_RECIPIENTS_PATH = path.resolve(process.cwd(), SESSION_DIR, 'notification-recipients.json');

function escapeAppleScriptLine(value: string): string {
  return `"${value.replace(/["\\]/g, '')}"`;
}

function toAppleScriptString(value: string): string {
  const lines = value.split('\n');
  if (lines.length === 0) {
    return '""';
  }

  return lines.map((line) => escapeAppleScriptLine(line)).join(' & return & ');
}

function sanitizeDesktopNotificationMessage(value: string): string {
  return value.replace(/["\\]/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeNotificationProfile(value: string | undefined): NotificationProfile {
  return value === 'production' ? 'production' : 'test';
}

export function normalizeIMessageRecipient(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.includes('@')) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  }

  return trimmed;
}

export function buildIMessageAppleScript(message: string, recipient: string): AppleScriptLine[] {
  return [
    'tell application "Messages"',
    'set targetService to first service whose service type = iMessage',
    `set targetParticipant to participant "${recipient.replace(/["\\]/g, '')}" of targetService`,
    `send ${toAppleScriptString(message)} to targetParticipant`,
    'end tell',
  ];
}

export function loadIMessageRecipients(
  profile: NotificationProfile,
  configPath = NOTIFICATION_RECIPIENTS_PATH,
): string[] {
  if (!fs.existsSync(configPath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as NotificationRecipientsConfig;
    const recipients = parsed[profile]?.imessageRecipients ?? [];
    const dedupedRecipients = Array.from(
      new Set(recipients.map((recipient) => normalizeIMessageRecipient(recipient)).filter(Boolean)),
    );
    if (dedupedRecipients.length === 0) {
      console.warn(`No iMessage recipients configured for profile "${profile}" in ${configPath}.`);
    }
    return Array.from(
      dedupedRecipients,
    );
  } catch (error) {
    console.warn(`Failed to read iMessage recipient config at ${configPath}: ${error}`);
    return [];
  }
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

export function buildFinalInventorySummary(summary: RunSummary): NotificationContent | null {
  const realHolds = summary.holds.filter((hold) => hold.stage === 'order-details');
  if (summary.dryRun || realHolds.length === 0) {
    return null;
  }

  const lines: string[] = [
    `Bear Lake Booker inventory for ${summary.targetDate}`,
    `Loop: ${summary.loop}`,
    `Stay length: ${summary.stayLength} night(s)`,
  ];

  for (const account of summary.accounts) {
    const realAccountHolds = account.holdDetails.filter((hold) => hold.stage === 'order-details');
    if (realAccountHolds.length === 0) {
      continue;
    }
    lines.push(`${account.account}:`);
    for (const hold of realAccountHolds) {
      lines.push(`- ${hold.site}: ${hold.detailsUrl ?? 'link unavailable'}`);
    }
  }

  lines.push('Manual checkout is still required before the holds expire.');

  return {
    title: 'Bear Lake Booker: INVENTORY',
    message: lines.join('\n'),
    agentLabel: '',
  };
}

/**
 * Sends a macOS desktop notification asynchronously.
 */
function sendDesktopNotification(content: NotificationContent) {
  const sanitized = sanitizeDesktopNotificationMessage(content.message);
  const process = spawn('osascript', [
    '-e',
    `display notification "${sanitized}" with title "${content.title}" sound name "Glass"`
  ]);

  process.on('error', () => {
    console.warn(`${content.agentLabel}Desktop notification failed to spawn.`);
  });
}

function sendIMessageToRecipients(content: NotificationContent, recipients: string[]) {
  for (const recipient of recipients) {
    const scriptLines = buildIMessageAppleScript(content.message, recipient);
    const process = spawn(
      'osascript',
      scriptLines.flatMap((line) => ['-e', line]),
    );
    let stderr = '';
    let stdout = '';

    process.on('error', () => {
      console.warn(`${content.agentLabel}iMessage failed to spawn for ${recipient}.`);
    });

    process.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    process.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    process.on('exit', (code) => {
      if (code === 0) {
        console.log(`${content.agentLabel}iMessage sent to ${recipient}`);
      } else {
        const details = stderr.trim() || stdout.trim();
        console.warn(
          `${content.agentLabel}iMessage failed for ${recipient} with exit code ${code}.${details ? ` ${details}` : ''}`,
        );
      }
    });
  }
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

  console.log(`\n${content.agentLabel}${content.message}`);
  sendDesktopNotification(content);
}

export function notifyFinalInventorySummary(summary: RunSummary, profile: NotificationProfile): void {
  const recipients = loadIMessageRecipients(profile);
  if (recipients.length === 0) {
    console.log(`No iMessage recipients configured for profile "${profile}"; skipping final inventory summary.`);
    return;
  }

  const content = buildFinalInventorySummary(summary);
  if (!content) {
    return;
  }

  console.log('\nDispatching final inventory summary via iMessage...');
  sendIMessageToRecipients(content, recipients);
}
