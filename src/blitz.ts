import { type BrowserContext, type Page } from 'playwright';
import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

import { parseArgs } from 'util';
import { loadAvailabilitySnapshot, type AvailabilitySnapshot } from './availability-snapshots';
import { loadArrivalShortlist, type ArrivalShortlist, type BookingTarget } from './arrival-shortlists';
import { isCartUrl } from './cart-detection';
import { ensureActiveSessionWithContext } from './session-manager';
import { normalizeCliAccounts, getAccountDisplayName, getAccountStorageKey } from './session-utils';
import { injectSession, sleep } from './automation';
import { loadSiteList } from './site-lists';
import { normalizeNotificationProfile, notifySuccess } from './notify';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values } = parseArgs({
  options: {
    date: { type: 'string', short: 'd' },
    length: { type: 'string', short: 'l' },
    loop: { type: 'string', short: 'o', default: 'BIRCH' },
    accounts: { type: 'string' },
    launchTime: { type: 'string' },
    headed: { type: 'boolean', default: false },
    checkoutAuthMode: { type: 'string', default: 'manual' },
    siteList: { type: 'string' },
    availabilitySnapshot: { type: 'string' },
    arrivalShortlist: { type: 'string' },
    sites: { type: 'string' },
    notificationProfile: { type: 'string', default: 'test' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(`
Bear Lake Booker — Blitz Mode

Usage:
  npm run blitz -- --launchTime HH:MM:SS [options]

Required:
  --launchTime <HH:MM:SS>         Target launch time (today, Mountain time)

Site sources (one required):
  --arrivalShortlist <path>        Arrival shortlist JSON (uses exact-fit targets)
  --availabilitySnapshot <path>    Availability snapshot JSON (derives eligible sites)
  --sites <csv>                    Comma-separated site IDs (requires --date, --length)

Options:
  -d, --date <MM/DD/YYYY>         Target arrival date
  -l, --length <nights>            Length of stay
  -o, --loop <name>                Loop name (default: BIRCH)
  --accounts <csv>                 Account email(s)
  --headed                         Keep browser visible
  --notificationProfile <name>     test | production (default: test)
  --siteList <spec>                Site list filter
  -h, --help                       Show this help
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// URL builder (exported for testing)
// ---------------------------------------------------------------------------

import { buildBlitzUrl } from './blitz-utils';
export { buildBlitzUrl };

// ---------------------------------------------------------------------------
// Site resolution
// ---------------------------------------------------------------------------

type BlitzTarget = { site: string; siteId: string; detailsUrl: string };

function resolveTargetsFromShortlist(shortlist: ArrivalShortlist): BlitzTarget[] {
  return shortlist.targets
    .filter((t) => t.fit === 'exact')
    .map(({ site, siteId, detailsUrl }) => ({ site, siteId, detailsUrl }));
}

function resolveTargetsFromSnapshot(
  snapshot: AvailabilitySnapshot,
  targetDate: string,
  stayLength: number,
): BlitzTarget[] {
  return snapshot.results
    .filter((r) => {
      if (!r.days || r.days.length === 0) return false;
      const startIdx = r.days.findIndex((d) => d.date === targetDate);
      if (startIdx < 0) return false;
      for (let i = startIdx; i < startIdx + stayLength; i++) {
        const day = r.days[i];
        if (!day || day.status !== 'A') return false;
      }
      return true;
    })
    .map(({ site, siteId, detailsUrl }) => ({ site, siteId, detailsUrl }));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const launchTimeStr = values.launchTime;
  if (!launchTimeStr) {
    console.error('ERROR: --launchTime is required');
    process.exit(1);
  }

  const targetDate = values.date ?? '';
  const stayLength = values.length ?? '';
  const notificationProfile = normalizeNotificationProfile(values.notificationProfile);
  const accounts = values.accounts ? values.accounts.split(',') : [];
  const normalizedAccounts = accounts.length > 0 ? normalizeCliAccounts(accounts) : [];
  const account = normalizedAccounts[0];

  // --- Resolve targets ---
  let targets: BlitzTarget[] = [];

  if (values.arrivalShortlist) {
    const shortlist = loadArrivalShortlist(values.arrivalShortlist);
    targets = resolveTargetsFromShortlist(shortlist);
    console.log(`Loaded ${targets.length} exact-fit targets from arrival shortlist.`);
  } else if (values.availabilitySnapshot) {
    if (!targetDate || !stayLength) {
      console.error('ERROR: --date and --length required with --availabilitySnapshot');
      process.exit(1);
    }
    const snapshot = loadAvailabilitySnapshot(values.availabilitySnapshot);
    targets = resolveTargetsFromSnapshot(snapshot, targetDate, Number(stayLength));
    console.log(`Loaded ${targets.length} fully-available targets from snapshot.`);
  } else if (values.sites) {
    console.error('ERROR: --sites requires --arrivalShortlist or --availabilitySnapshot for detailsUrl lookup');
    process.exit(1);
  } else {
    console.error('ERROR: Provide --arrivalShortlist or --availabilitySnapshot');
    process.exit(1);
  }

  // Filter to --sites if provided
  if (values.sites) {
    const allowed = new Set(values.sites.split(',').map((s) => s.trim().toUpperCase()));
    targets = targets.filter((t) => allowed.has(t.site.toUpperCase()));
    console.log(`Filtered to ${targets.length} targets matching --sites.`);
  }

  // Filter to --siteList if provided
  if (values.siteList) {
    const siteList = loadSiteList(values.siteList);
    const allowed = new Set([...siteList.topChoices, ...siteList.backups].map((s) => s.toUpperCase()));
    targets = targets.filter((t) => allowed.has(t.site.toUpperCase()));
    console.log(`Filtered to ${targets.length} targets matching --siteList.`);
  }

  if (targets.length === 0) {
    console.error('No targets to blitz. Exiting.');
    process.exit(1);
  }

  console.log(`\nBlitz targets (${targets.length}):`);
  targets.forEach((t) => console.log(`  ${t.site} → ${t.detailsUrl}`));

  // --- Authenticate ---
  const sessionResult = await ensureActiveSessionWithContext(account);
  if (sessionResult.status === 'failed') {
    console.error('Session authentication failed. Exiting.');
    process.exit(1);
  }

  // --- Launch browser and open tabs ---
  const headless = !values.headed;
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({ timezoneId: 'America/Denver' });
  await injectSession(context, account);

  // Close the session-manager context if one was returned
  if (sessionResult.context) {
    await sessionResult.context.close().catch(() => {});
  }

  const resolvedDate = targetDate || (values.arrivalShortlist ? loadArrivalShortlist(values.arrivalShortlist).targetDate : '');
  const resolvedLength = stayLength || (values.arrivalShortlist ? loadArrivalShortlist(values.arrivalShortlist).stayLength : '');

  type TabEntry = { page: Page; site: string };
  const tabs: TabEntry[] = [];

  console.log(`\nOpening ${targets.length} tabs...`);
  for (const target of targets) {
    const url = buildBlitzUrl(target.detailsUrl, resolvedDate, resolvedLength);
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    tabs.push({ page, site: target.site });
    console.log(`  ✓ ${target.site}`);
  }
  console.log(`All ${tabs.length} tabs loaded.\n`);

  // --- Wait for launch time ---
  const now = new Date();
  const [hh, mm, ss] = launchTimeStr.split(':').map(Number);
  const launchDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, ss);

  // Use Mountain time offset — launch times are in MT
  const msUntilLaunch = launchDate.getTime() - now.getTime();
  if (msUntilLaunch > 0) {
    console.log(`Waiting ${Math.round(msUntilLaunch / 1000)}s until launch at ${launchTimeStr}...`);
    const TICK_MS = 500;
    while (Date.now() < launchDate.getTime()) {
      const remaining = launchDate.getTime() - Date.now();
      if (remaining > 10_000 && remaining % 10_000 < TICK_MS) {
        console.log(`  T-${Math.round(remaining / 1000)}s`);
      }
      await sleep(TICK_MS);
    }
    console.log('LAUNCH!');
  } else {
    console.log('Launch time already passed — clicking immediately.');
  }

  // --- Click "Book these Dates" on ALL tabs simultaneously ---
  const results = await Promise.all(tabs.map(async ({ page, site }) => {
    try {
      const btn = page.locator('#btnbookdates, button:has-text("Book these Dates")').first();
      if ((await btn.count()) === 0) return { site, success: false, url: page.url(), reason: 'no-button' };
      const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
      await btn.click({ force: true });
      await nav;
      const url = page.url();
      const success = isCartUrl(url);
      return { site, success, url, reason: success ? 'cart-url' : 'not-cart' };
    } catch (err) {
      return { site, success: false, url: page.url(), reason: `error: ${err}` };
    }
  }));

  // --- Report results ---
  console.log('\n=== BLITZ RESULTS ===');
  const successes: string[] = [];
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    console.log(`  ${icon} ${r.site} — ${r.reason} (${r.url})`);
    if (r.success) successes.push(r.site);
  }
  console.log(`\n${successes.length}/${results.length} sites captured.\n`);

  // --- Notify on success ---
  if (successes.length > 0) {
    notifySuccess(
      successes,
      null,
      'site-details',
      resolvedDate,
      values.loop ?? 'BIRCH',
      resolvedLength,
    );
  }

  // --- Keep browser open if headed ---
  if (values.headed && context.pages().length > 0) {
    console.log('Browser open — complete checkout manually. Close browser to exit.');
    await context.pages()[0]?.waitForEvent('close').catch(() => {});
  }

  await browser.close().catch(() => {});
}

main().catch((err) => {
  console.error('Blitz failed:', err);
  process.exit(1);
});
