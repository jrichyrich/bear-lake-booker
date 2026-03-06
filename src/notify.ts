import { execSync } from 'child_process';
import { RECIPIENT } from './config';

export type SuccessStage = 'site-details' | 'order-details';

export function notifySuccess(
    siteId: string,
    agentId: number,
    stage: SuccessStage,
    targetDate: string,
    loop: string
) {
    const stageLabel = stage === 'order-details' ? 'reached Order Details for' : 'opened site details for';
    const message = `Bear Lake Booker: Agent ${agentId} ${stageLabel} site ${siteId} for ${targetDate} in ${loop}.`;

    console.log(`\n[Agent ${agentId}] ${stage === 'order-details' ? 'Order Details reached' : 'Site details opened'} for ${siteId}.`);

    try {
        const escaped = message.replace(/"/g, '\\"');
        execSync(`osascript -e 'display notification "${escaped}" with title "Bear Lake Booker: CAPTURE" sound name "Glass"'`);
    } catch {
        console.warn(`[Agent ${agentId}] Desktop notification failed.`);
        // TODO: For non-macOS environments, you could swap this block with a local Node.js notification package 
        // such as node-notifier, or emit a desktop webhook to Windows equivalent tooling.
    }

    try {
        const escaped = message.replace(/"/g, '\\"');
        execSync(`osascript -e 'tell application "Messages" to send "${escaped}" to buddy "${RECIPIENT}"'`);
        console.log(`[Agent ${agentId}] iMessage sent to ${RECIPIENT}`);
    } catch {
        console.warn(`[Agent ${agentId}] iMessage failed.`);
        // TODO: For non-macOS users, this block could be seamlessly swapped to dispatch an SMS 
        // payload to Twilio using their node-sdk, or an email via SendGrid's node-sdk to retain
        // alerting parity with AppleScript iMessage bindings.
    }
}
