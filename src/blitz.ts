import { type Page } from 'playwright';
import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

import { parseArgs } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { loadAvailabilitySnapshot, type AvailabilitySnapshot } from './availability-snapshots';
import { loadArrivalShortlist, type ArrivalShortlist } from './arrival-shortlists';
import { normalizeCliAccounts, getReadableSessionPath } from './session-utils';
import { sleep } from './automation';
import { loadSiteList } from './site-lists';
import { buildBlitzUrl } from './blitz-utils';
export { buildBlitzUrl };

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
    siteList: { type: 'string' },
    availabilitySnapshot: { type: 'string' },
    arrivalShortlist: { type: 'string' },
    sites: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(`
Bear Lake Booker — Blitz Mode

Pre-loads site detail tabs, clicks "Book these Dates" on all at launch time.
No login needed — you complete login manually after sites are grabbed.

Usage:
  npm run blitz -- --launchTime HH:MM:SS [options]

Required:
  --launchTime <HH:MM:SS>         Target launch time (local system time)

Site sources (one required):
  --arrivalShortlist <path>        Arrival shortlist JSON (uses exact-fit targets)
  --availabilitySnapshot <path>    Availability snapshot JSON (derives eligible sites)

Options:
  -d, --date <MM/DD/YYYY>         Target arrival date
  -l, --length <nights>           Length of stay
  -o, --loop <name>               Loop name (default: BIRCH)
  --sites <csv>                   Filter to specific site IDs
  --siteList <spec>               Filter by ranked site list
  -h, --help                      Show this help
`);
  process.exit(0);
}

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
        if (!day || (day.status !== 'A' && day.status !== 'a')) return false;
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
  } else {
    console.error('ERROR: Provide --arrivalShortlist or --availabilitySnapshot');
    process.exit(1);
  }

  if (values.sites) {
    const allowed = new Set(values.sites.split(',').map((s) => s.trim().toUpperCase()));
    targets = targets.filter((t) => allowed.has(t.site.toUpperCase()));
    console.log(`Filtered to ${targets.length} targets matching --sites.`);
  }

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

  // --- Resolve dates ---
  const resolvedDate = targetDate || (values.arrivalShortlist ? loadArrivalShortlist(values.arrivalShortlist).targetDate : '');
  const resolvedLength = stayLength || (values.arrivalShortlist ? loadArrivalShortlist(values.arrivalShortlist).stayLength : '');

  const targetUrls = targets.map((t) => ({
    site: t.site,
    url: buildBlitzUrl(t.detailsUrl, resolvedDate, resolvedLength),
  }));

  console.log(`\nBlitz targets (${targetUrls.length}):`);
  targetUrls.forEach((t) => console.log(`  ${t.site} → ${t.url}`));

  // --- Launch browser — use saved session if available ---
  const accounts = values.accounts ? values.accounts.split(',') : [];
  const normalizedAccounts = accounts.length > 0 ? normalizeCliAccounts(accounts) : [];
  const account = normalizedAccounts[0];

  const browser = await chromium.launch({ headless: false });
  const sessionPath = account ? getReadableSessionPath(account) : null;
  const hasSession = sessionPath && fs.existsSync(sessionPath);
  const context = hasSession
    ? await browser.newContext({ timezoneId: 'America/Denver', storageState: sessionPath })
    : await browser.newContext({ timezoneId: 'America/Denver' });
  console.log(hasSession ? `Session loaded from ${sessionPath}` : 'No session — login will be required after booking.');

  // --- Wait until T-10s, then load pages fresh ---
  const timeParts = launchTimeStr.split(':').map(Number);
  const launchDate = new Date();
  launchDate.setHours(timeParts[0] ?? 0, timeParts[1] ?? 0, timeParts[2] ?? 0, 0);

  const WARMUP_SECONDS = 10;
  const warmupDate = new Date(launchDate.getTime() - WARMUP_SECONDS * 1000);
  const msUntilWarmup = warmupDate.getTime() - Date.now();

  if (msUntilWarmup > 0) {
    console.log(`\nWaiting until ${warmupDate.toLocaleTimeString()} to load pages (T-${WARMUP_SECONDS}s)...`);
    while (Date.now() < warmupDate.getTime()) {
      const remaining = launchDate.getTime() - Date.now();
      if (remaining % 10_000 < 500 && remaining > 10_000) {
        console.log(`  T-${Math.round(remaining / 1000)}s`);
      }
      await sleep(500);
    }
  }

  // --- Open all tabs fresh ---
  console.log(`\nOpening ${targetUrls.length} tabs...`);
  type TabEntry = { page: Page; site: string };
  const tabs: TabEntry[] = [];
  for (const { site, url } of targetUrls) {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const hasButton = (await page.locator('#btnbookdates').count()) > 0;
    console.log(`  ✓ ${site} — button ${hasButton ? 'ready' : 'MISSING'}`);
    tabs.push({ page, site });
  }
  console.log(`All ${tabs.length} tabs loaded.`);

  // --- Wait for exact launch time ---
  const msUntilLaunch = launchDate.getTime() - Date.now();
  if (msUntilLaunch > 0) {
    console.log(`\nWaiting ${Math.round(msUntilLaunch / 1000)}s for launch at ${launchTimeStr}...`);
    while (Date.now() < launchDate.getTime()) {
      await sleep(50);
    }
  }
  console.log('🚀 LAUNCH!\n');

  // --- Click "Book these Dates" on ALL tabs simultaneously ---
  const results = await Promise.all(tabs.map(async ({ page, site }) => {
    try {
      const btn = page.locator('#btnbookdates').first();
      if ((await btn.count()) === 0) return { site, success: false, url: page.url(), reason: 'no-button' };
      const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
      await btn.click({ force: true });
      await nav;

      const url = page.url();
      const bodyText = (await page.textContent('body')) || '';

      // Login page = success! Site is held, just needs manual login to claim.
      const isLoginPage = url.includes('memberSignIn') || bodyText.includes('Sign In') || bodyText.includes('Email Address');
      if (isLoginPage) return { site, success: true, url, reason: 'login-page (site held — log in to claim!)' };

      // Inventory gone
      if (bodyText.includes('Inventory is not available') || bodyText.includes('not available')) {
        return { site, success: false, url, reason: 'inventory-not-available' };
      }

      return { site, success: false, url, reason: 'unknown-page' };
    } catch (err) {
      return { site, success: false, url: page.url(), reason: `error: ${err}` };
    }
  }));

  // --- Report results ---
  console.log('\n=== BLITZ RESULTS ===');
  const successes: string[] = [];
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    console.log(`  ${icon} ${r.site} — ${r.reason}`);
    if (r.success) successes.push(r.site);
  }
  console.log(`\n${successes.length}/${results.length} sites grabbed.`);

  if (successes.length > 0) {
    console.log('\n⚠️  ACTION REQUIRED: Log in on a successful tab to complete the hold!');
    console.log('    The site is reserved for you until you close the page or the hold expires.');
  }

  // --- Keep browser open for manual login ---
  console.log('\nBrowser open — complete login manually. Close browser to exit.');
  await context.pages()[0]?.waitForEvent('close').catch(() => {});
  await browser?.close().catch(() => {});
}

main().catch((err) => {
  console.error('Blitz failed:', err);
  process.exit(1);
});
