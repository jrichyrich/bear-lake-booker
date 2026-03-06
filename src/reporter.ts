import * as fs from 'fs';
import * as path from 'path';

interface HoldRecord {
    agentId: number;
    site: string;
    stage: string;
    timestamp: string;
}

interface RunSummary {
    timestamp: string;
    targetDate: string;
    loop: string;
    agentCount: number;
    bookingMode: 'single' | 'multi';
    maxHolds: number;
    holds: HoldRecord[];
    winningAgent: number | null;
    winningSite: string | null;
    status: 'success' | 'failure';
}

export function writeRunSummary(summary: RunSummary) {
    const logsDir = path.resolve(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `summary-${timestampStr}.json`;
    const filepath = path.join(logsDir, filename);

    try {
        fs.writeFileSync(filepath, JSON.stringify(summary, null, 2), 'utf-8');
        console.log(`\nRun summary written to ${filepath}`);
    } catch (error) {
        console.error(`Failed to write run summary: ${error}`);
    }
}
