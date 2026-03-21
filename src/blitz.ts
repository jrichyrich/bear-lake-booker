import { type BrowserContext, type Page } from 'playwright';
import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

import { parseArgs } from 'util';
import * as fs from 'fs';
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
    tabs: { type: 'string', default: '1' },
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

Pre-loads site detail tabs across multiple independent browser contexts,
clicks "Book these Dates" on all simultaneously at launch time.
Each context is a separate session = independent booking attempt.

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
  --accounts <csv>                Account email(s) — session injected into each context
  --tabs <number>                 Contexts per site (default: 1, e.g. 10 = 10 independent attempts)
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
        // A = available now, a = future available, R = reserved (becomes available at window open)
        if (!day || day.status === 'X') return false;
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
  const TABS_PER_SITE = Math.max(1, parseInt(values.tabs ?? '1', 10));

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
    console.log(`Loaded ${targets.length} targets from snapshot.`);
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

  const totalTabs = targetUrls.length * TABS_PER_SITE;
  console.log(`\nBlitz plan: ${targetUrls.length} sites × ${TABS_PER_SITE} contexts = ${totalTabs} tabs`);
  targetUrls.forEach((t) => console.log(`  ${t.site} → ${t.url}`));

  // --- Launch browser with N independent contexts ---
  const accounts = values.accounts ? values.accounts.split(',') : [];
  const normalizedAccounts = accounts.length > 0 ? normalizeCliAccounts(accounts) : [];
  const account = normalizedAccounts[0];

  const sessionPath = account ? getReadableSessionPath(account) : null;
  const hasSession = sessionPath && fs.existsSync(sessionPath);
  console.log(hasSession ? `\nSession: ${sessionPath}` : '\nNo session — login required after booking.');

  const browser = await chromium.launch({ headless: false });
  const contexts: BrowserContext[] = [];
  for (let i = 0; i < TABS_PER_SITE; i++) {
    const ctx = hasSession
      ? await browser.newContext({ timezoneId: 'America/Denver', storageState: sessionPath })
      : await browser.newContext({ timezoneId: 'America/Denver' });
    contexts.push(ctx);
  }
  console.log(`Created ${contexts.length} independent browser contexts.`);

  // --- Wait until T-10s, then load pages fresh ---
  const timeParts = launchTimeStr.split(':').map(Number);
  const launchDate = new Date();
  launchDate.setHours(timeParts[0] ?? 0, timeParts[1] ?? 0, timeParts[2] ?? 0, 0);

  const WARMUP_SECONDS = 15;
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

  // --- Open tabs: one per context per target site ---
  type TabEntry = { page: Page; site: string; ctxIndex: number };
  const tabs: TabEntry[] = [];

  console.log(`\nOpening ${totalTabs} tabs...`);
  for (const [ctxIdx, ctx] of contexts.entries()) {
    for (const { site, url } of targetUrls) {
      const page = await ctx.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      const hasButton = (await page.locator('#btnbookdates').count()) > 0;
      console.log(`  ✓ [ctx ${ctxIdx + 1}] ${site} — ${hasButton ? 'ready' : 'MISSING'}`);
      tabs.push({ page, site, ctxIndex: ctxIdx });
    }
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
  const results = await Promise.all(tabs.map(async ({ page, site, ctxIndex }) => {
    try {
      const btn = page.locator('#btnbookdates').first();
      if ((await btn.count()) === 0) return { site, ctxIndex, success: false, url: page.url(), reason: 'no-button' };
      const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
      await btn.click({ force: true });
      await nav;

      const url = page.url();
      const bodyText = (await page.textContent('body')) || '';

      // Cart URL = direct success (had valid session)
      if (url.includes('viewShoppingCart') || url.includes('shoppingCart')) {
        return { site, ctxIndex, success: true, url, reason: 'cart (direct!)' };
      }

      // Login page = success! Site is held, just needs manual login.
      const isLoginPage = url.includes('memberSignIn') || bodyText.includes('Sign In') || bodyText.includes('Email Address');
      if (isLoginPage) return { site, ctxIndex, success: true, url, reason: 'login-page (site held!)' };

      // Inventory gone
      if (bodyText.includes('Inventory is not available') || bodyText.includes('not available')) {
        return { site, ctxIndex, success: false, url, reason: 'inventory-not-available' };
      }

      return { site, ctxIndex, success: false, url, reason: 'unknown-page' };
    } catch (err) {
      return { site, ctxIndex, success: false, url: page.url(), reason: `error: ${err}` };
    }
  }));

  // --- Report results ---
  console.log('\n=== BLITZ RESULTS ===');
  const successes: string[] = [];
  for (const r of results) {
    const icon = r.success ? '✅' : '❌';
    console.log(`  ${icon} [ctx ${r.ctxIndex + 1}] ${r.site} — ${r.reason}`);
    if (r.success && !successes.includes(r.site)) successes.push(r.site);
  }
  console.log(`\n${successes.length} site(s) grabbed out of ${results.length} attempts.`);

  if (successes.length > 0) {
    console.log('\n⚠️  ACTION REQUIRED: Log in on a successful tab to complete the hold!');
  }

  // --- Keep browser open for manual login ---
  console.log('\nBrowser open — complete login manually. Close any tab to exit.');
  await Promise.race(
    contexts.flatMap((ctx) => ctx.pages().map((p) => p.waitForEvent('close').catch(() => {}))),
  );
  for (const ctx of contexts) {
    await ctx.close().catch(() => {});
  }
  await browser?.close().catch(() => {});
}

main().catch((err) => {
  console.error('Blitz failed:', err);
  process.exit(1);
});
