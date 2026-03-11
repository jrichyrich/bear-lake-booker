import { parseArgs } from 'util';
import { spawnSync } from 'child_process';
import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

import { searchAvailability } from './reserveamerica';
import { inspectCartState } from './automation';
import { sleep } from './automation';
import { ensureActiveSession } from './session-manager';
import { getAccountDisplayName, normalizeCliAccounts, sessionExists, getReadableSessionPath } from './session-utils';
import { normalizeNotificationProfile } from './notify';
import { loadSiteList } from './site-lists';
import { buildReleaseRaceArgs, resolveReleaseSchedule, selectReleaseSites } from './release-utils';

const args = process.argv.slice(2);

const { values } = parseArgs({
  args,
  options: {
    launchTime: { type: 'string' },
    date: { type: 'string', short: 'd', default: '07/22/2026' },
    length: { type: 'string', short: 'l', default: '6' },
    loop: { type: 'string', short: 'o', default: 'BIRCH' },
    concurrency: { type: 'string', short: 'c', default: '10' },
    accounts: { type: 'string' },
    sites: { type: 'string' },
    siteList: { type: 'string' },
    headed: { type: 'boolean', default: false },
    checkoutAuthMode: { type: 'string' },
    notificationProfile: { type: 'string', default: 'test' },
    scoutLeadMinutes: { type: 'string', default: '2' },
    warmupLeadSeconds: { type: 'string', default: '45' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: false,
});

if (values.help || !values.launchTime) {
  console.log(`
Bear Lake Booker - Release / Rehearsal Wrapper

Usage:
  npm run release -- --launchTime HH:MM:SS [race options]

Required:
  --launchTime <HH:MM:SS>      Target launch time for today

Common options:
  -d, --date <MM/DD/YYYY>      Target arrival date
  -l, --length <nights>        Length of stay
  -o, --loop <name>            Loop name
  -c, --concurrency <count>    Agent count / target site count
  --accounts <csv>             Account emails
  --sites <csv>                Explicit site override (skip scout)
  --siteList <name-or-path>    Ranked site list from camp sites or a path
  --notificationProfile <name> test or production [default: test]
  --scoutLeadMinutes <mins>    Minutes before launch to freeze scout [default: 2]
  --warmupLeadSeconds <secs>   Seconds before launch to start race warmup [default: 45]

All remaining options are passed through to "npm run race".
  `);
  process.exit(values.help ? 0 : 1);
}

const launchTime = values.launchTime as string;
const targetDate = values.date as string;
const stayLength = values.length as string;
const loop = values.loop as string;
const concurrency = parseInt(values.concurrency as string, 10);
const scoutLeadMinutes = parseInt(values.scoutLeadMinutes as string, 10);
const warmupLeadSeconds = parseInt(values.warmupLeadSeconds as string, 10);
const explicitSites = typeof values.sites === 'string'
  ? values.sites.split(',').map((site) => site.trim().toUpperCase()).filter(Boolean)
  : [];
const siteListSpec = typeof values.siteList === 'string' ? values.siteList.trim() : '';
const requestedAccounts = typeof values.accounts === 'string'
  ? normalizeCliAccounts(values.accounts.split(','), '[Release] ')
  : [undefined];
const headed = values.headed === true;
const notificationProfile = normalizeNotificationProfile(values.notificationProfile as string | undefined);
const checkoutAuthMode: 'auto' | 'manual' = values.checkoutAuthMode === 'auto'
  ? 'auto'
  : values.checkoutAuthMode === 'manual'
    ? 'manual'
    : headed
      ? 'manual'
      : 'auto';

function formatClock(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

async function waitUntil(target: Date, label: string): Promise<void> {
  const now = new Date();
  if (target.getTime() <= now.getTime()) {
    return;
  }

  console.log(`[Release] Waiting until ${formatClock(target)} for ${label}...`);
  await sleep(target.getTime() - now.getTime());
}

async function ensureSessionAndEmptyCart(account?: string): Promise<void> {
  const displayName = getAccountDisplayName(account);
  const sessionResult = await ensureActiveSession(account, {
    logPrefix: `[Release][${displayName}] `,
  });
  if (sessionResult === 'failed') {
    throw new Error(`[${displayName}] Session validation failed.`);
  }

    const browser = await chromium.launch({ headless: !headed });
  try {
    const context = await browser.newContext(sessionExists(account)
      ? {
          storageState: getReadableSessionPath(account),
          timezoneId: 'America/Denver',
        }
      : {
          timezoneId: 'America/Denver',
        });
    try {
      const cartState = await inspectCartState(
        context,
        `[Release][${displayName}][Cart] `,
        account,
        headed,
        checkoutAuthMode,
      );
      if (cartState.error) {
        throw new Error(`[${displayName}] Unable to verify cart state: ${cartState.error}`);
      }
      if (cartState.siteIds.length > 0) {
        throw new Error(`[${displayName}] Cart is not empty: ${cartState.siteIds.join(', ')}`);
      }
      console.log(`[Release][${displayName}] Cart preflight is empty.`);
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

async function resolveTargetSites(): Promise<string[]> {
  const desiredCount = Math.max(concurrency, requestedAccounts.filter(Boolean).length || 1);
  if (explicitSites.length > 0) {
    return explicitSites;
  }

  const search = await searchAvailability({
    date: targetDate,
    length: stayLength,
    loop,
  });
  const selectedSites = selectReleaseSites(
    search.exactDateMatches.map((site) => site.site),
    desiredCount,
  );
  if (selectedSites.length === 0) {
    throw new Error(`No exact-date ${loop} sites were available for ${targetDate} during the scout.`);
  }
  return selectedSites;
}

async function main(): Promise<void> {
  const schedule = resolveReleaseSchedule(new Date(), launchTime, scoutLeadMinutes, warmupLeadSeconds);
  const loadedSiteList = explicitSites.length === 0 && siteListSpec ? loadSiteList(siteListSpec) : null;

  console.log('--- Bear Lake Booker: Release / Rehearsal Wrapper ---');
  console.log(`[Release] Target date: ${targetDate}`);
  console.log(`[Release] Launch time: ${launchTime}`);
  console.log(`[Release] Scout time: ${formatClock(schedule.scoutAt)}`);
  console.log(`[Release] Warmup start: ${formatClock(schedule.warmupAt)}`);
  console.log(`[Release] Notification profile: ${notificationProfile}`);
  if (loadedSiteList) {
    console.log(`[Release] Site list source: ${loadedSiteList.sourcePath}`);
  }
  console.log(`[Release] Accounts: ${requestedAccounts.map((account) => getAccountDisplayName(account)).join(', ')}`);

  for (const account of requestedAccounts) {
    await ensureSessionAndEmptyCart(account);
  }

  if (explicitSites.length === 0 && !loadedSiteList) {
    await waitUntil(schedule.scoutAt, 'site scout');
  }
  const resolvedSites = loadedSiteList?.siteIds ?? await resolveTargetSites();

  console.log('[Release] Resolved launch plan:');
  console.log(`  Date: ${targetDate}`);
  console.log(`  Loop: ${loop}`);
  console.log(`  Launch time: ${launchTime}`);
  console.log(`  Warmup start: ${formatClock(schedule.warmupAt)}`);
  console.log(`  Notification profile: ${notificationProfile}`);
  if (loadedSiteList) {
    console.log(`  Site list source: ${loadedSiteList.sourcePath}`);
  }
  console.log(`  Sites: ${resolvedSites.join(', ')}`);
  console.log(`  Accounts: ${requestedAccounts.map((account) => getAccountDisplayName(account)).join(', ')}`);

  await waitUntil(schedule.warmupAt, 'race warmup');
  const raceArgs = buildReleaseRaceArgs(
    args,
    launchTime,
    resolvedSites,
    notificationProfile,
    loadedSiteList?.sourcePath,
  );
  const result = spawnSync('npx', ['tsx', 'src/race.ts', ...raceArgs], {
    stdio: 'inherit',
    env: process.env,
  });

  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
