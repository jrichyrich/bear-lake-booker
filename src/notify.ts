import { execFileSync } from 'child_process';
import { RECIPIENT } from './config';

export type SuccessStage = 'site-details' | 'order-details' | 'monitoring';

export function notifySuccess(
    siteId: string | string[],
    agentId: number | null,
    stage: SuccessStage,
    targetDate: string,
    loop: string,
    stayLength?: string
) {
    let message = '';
    let title = 'Bear Lake Booker: CAPTURE';

    if (stage === 'monitoring') {
        const sites = Array.isArray(siteId) ? siteId : [siteId];
        message = `Bear Lake Booker: Found ${sites.length} site(s) for ${targetDate} (${stayLength} nights) in ${loop}: ${sites.join(', ')}`;
        title = 'Bear Lake Booker: MONITOR';
    } else {
        const stageLabel = stage === 'order-details' ? 'reached Order Details for' : 'opened site details for';
        message = `Bear Lake Booker: Agent ${agentId} ${stageLabel} site ${siteId} for ${targetDate} in ${loop}.`;
    }

    const agentLabel = agentId !== null ? `[Agent ${agentId}] ` : '';
    console.log(`\n${agentLabel}${message}`);

    const escaped = message.replace(/"/g, '\\"');

    try {
        execFileSync('osascript', ['-e', `display notification "${escaped}" with title "${title}" sound name "Glass"`]);
    } catch {
        console.warn(`${agentLabel}Desktop notification failed.`);
    }

    try {
        execFileSync('osascript', ['-e', `tell application "Messages" to send "${escaped}" to buddy "${RECIPIENT}"`]);
        console.log(`${agentLabel}iMessage sent to ${RECIPIENT}`);
    } catch {
        console.warn(`${agentLabel}iMessage failed.`);
    }
}
