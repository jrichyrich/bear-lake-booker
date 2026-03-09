import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { parseArgs } from 'util';
import { CAPTURE_EXIT_CODES, type CaptureResultArtifact, captureExitCodeToOutcome } from './flow-contract';

const args = process.argv.slice(2);

console.log('=========================================');
console.log('   Bear Lake Booker - End-to-End Flow    ');
console.log('=========================================');
console.log('');

// Parse the --accounts argument to pass to view-cart later
let accountsArg = '';
let isDryRun = false;
const raceArgs: string[] = [];
try {
    const { values } = parseArgs({
        args,
        options: {
            accounts: { type: 'string' },
            dryRun: { type: 'boolean' },
            help: { type: 'boolean', short: 'h' }
        },
        strict: false,
    });

    if (values.help) {
        console.log(`
Usage:
  npm run flow -- [options]

This wrapper executes the full booking flow mapping to your flowchart:
1. Ensure Valid Session (manual login if captcha/session refresh is required)
2. Proceed to warm up
3. Launch at launch time
4. Book Spots -> Save to Cart -> Close Windows
5. Open Each session's Cart in a browser window

It accepts all arguments supported by "npm run race".

Example:
  npm run flow -- -d 07/08/2026 -l 6 -c 5 -t 07:59:59 --accounts lisarichards1984,jrichards1981 -b
    `);
        process.exit(0);
    }

    if (typeof values.accounts === 'string') {
        accountsArg = values.accounts;
    }
    if (values.dryRun) {
        isDryRun = true;
    }

    raceArgs.push(...args);
} catch (e) {
    // Ignore parse errors here, let race.ts handle strict validation
    raceArgs.push(...args);
}

// Step 1 - 6: Race (Validates sessions, warms up, books, closes windows)
console.log('▶️  STEP 1: Initiating Capture Phase (race.ts)');
console.log('   (Handles Auth validation, warm-up, and booking)\\n');

const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}
const captureResultPath = path.join(logsDir, `capture-result-${Date.now()}.json`);

const raceResult = spawnSync('npx', ['tsx', 'src/race.ts', ...raceArgs], {
    stdio: 'inherit',
    env: { ...process.env, CAPTURE_RESULT_PATH: captureResultPath },
});
const captureOutcome = captureExitCodeToOutcome(raceResult.status);

let captureResult: CaptureResultArtifact | null = null;
if (fs.existsSync(captureResultPath)) {
    try {
        captureResult = JSON.parse(fs.readFileSync(captureResultPath, 'utf-8')) as CaptureResultArtifact;
    } catch {
        captureResult = null;
    }
}

if (captureOutcome === 'no-availability') {
    console.log('\\n✅ No availability detected. Ending flow securely without opening empty carts.\\n');
    process.exit(0);
} else if (captureOutcome !== 'success') {
    console.error('\\n❌ Capture phase failed or was interrupted. Stopping flow.');
    process.exit(raceResult.status ?? CAPTURE_EXIT_CODES.error);
}

if (isDryRun) {
    console.log('\\n✅ Dry Run complete. Stopping flow to prevent opening carts.\\n');
    process.exit(0);
}

// Step 7: View Cart (Open Each sessions Carts in window)
console.log('\\n▶️  STEP 2: Initiating Checkout Phase (view-cart.ts)');
console.log('   (Opening secured carts for manual checkout)\\n');

const viewCartArgs = ['tsx', 'src/view-cart.ts'];
if (accountsArg) {
    const accountsToOpen = captureResult?.accountsWithHolds ?? accountsArg.split(',').map((value) => value.trim()).filter(Boolean);
    if (accountsToOpen.length === 0) {
        console.log('\\n✅ Capture completed, but no account carts were populated. Skipping checkout windows.\\n');
        process.exit(0);
    }
    viewCartArgs.push('--accounts', accountsToOpen.join(','));
} else if (captureResult && !captureResult.usedDefaultAccount) {
    console.log('\\n✅ Capture completed without a default-account cart to open.\\n');
    process.exit(0);
}

const cartResult = spawnSync('npx', viewCartArgs, { stdio: 'inherit' });

if (cartResult.status !== 0) {
    console.error('\\n❌ Checkout phase encountered an error.');
    process.exit(cartResult.status ?? 1);
}

console.log('\\n✅ Flow completed successfully.');
