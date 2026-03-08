import { spawnSync } from 'child_process';
import { parseArgs } from 'util';

const args = process.argv.slice(2);

console.log('=========================================');
console.log('   Bear Lake Booker - End-to-End Flow    ');
console.log('=========================================');
console.log('');

// Parse the --accounts argument to pass to view-cart later
let accountsArg = '';
let isDryRun = false;
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
1. Ensure Valid Session (via race.ts headless auto-login)
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
} catch (e) {
    // Ignore parse errors here, let race.ts handle strict validation
}

// Step 1 - 6: Race (Validates sessions, warms up, books, closes windows)
console.log('▶️  STEP 1: Initiating Capture Phase (race.ts)');
console.log('   (Handles Auth validation, warm-up, and booking)\\n');

const raceResult = spawnSync('npx', ['tsx', 'src/race.ts', ...args], { stdio: 'inherit' });

if (raceResult.status === 2) {
    console.log('\\n✅ No availability detected. Ending flow securely without opening empty carts.\\n');
    process.exit(0);
} else if (raceResult.status !== 0) {
    console.error('\\n❌ Capture phase failed or was interrupted. Stopping flow.');
    process.exit(raceResult.status ?? 1);
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
    viewCartArgs.push('--accounts', accountsArg);
}

const cartResult = spawnSync('npx', viewCartArgs, { stdio: 'inherit' });

if (cartResult.status !== 0) {
    console.error('\\n❌ Checkout phase encountered an error.');
    process.exit(cartResult.status ?? 1);
}

console.log('\\n✅ Flow completed successfully.');
