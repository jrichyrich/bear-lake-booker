import { type BrowserContext, type Page } from 'playwright';
import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());
import { parseArgs } from 'util';
import * as fs from 'fs';
import { resolve } from 'path';
import { searchAvailability, type SiteAvailability } from './reserveamerica';
import { PARK_URL, SESSION_FILE, USER_AGENTS } from './config';
import { notifySuccess, type SuccessStage } from './notify';
import { writeRunSummary } from './reporter';
import { getThemeArgs } from './theme';
import { getSessionFile, getSessionPath, injectSessionState, getSessionExpiryInfo, startHeartbeat } from './session-utils';
import { performAutoLogin } from './auth';
import {
  sleep,
  ensureLoggedIn,
  primeSearchForm,
  submitSearchForm,
  waitForSearchResults,
  resolveTargetSites,
  openSiteDetails,
  executeBookingFlow,
  buildDirectSiteUrl,
  submitWithRetry,
  snipeDirectUrl,
  preWarmConnections,
} from './automation';
import {
  parseTargetTime,
  msUntilTargetTime,
  waitForTargetTime,
  assertBookingWindow,
  getDynamicMaxDate,
  getDynamicRandomDate,
} from './timer-utils';

const { values } = parseArgs({
  options: {
    date: { type: 'string', short: 'd', default: '07/08/2026' },
    length: { type: 'string', short: 'l', default: '6' },
    loop: { type: 'string', short: 'o', default: 'BIRCH' },
    concurrency: { type: 'string', short: 'c', default: '10' },
    time: { type: 'string', short: 't' },
    monitorInterval: { type: 'string', short: 'm' },
    book: { type: 'boolean', short: 'b', default: false },
    dryRun: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    bookingMode: { type: 'string', default: 'single' },
    maxHolds: { type: 'string', default: '1' },
    profileMode: { type: 'string', default: 'persistent' },
    profileDir: { type: 'string', default: 'profiles' },
    resetProfiles: { type: 'boolean', default: false },
    screenshotOnWin: { type: 'boolean', default: false },
    sequential: { type: 'boolean', default: false },
    sites: { type: 'string' },
    snipe: { type: 'boolean', default: false },
    warmup: { type: 'string', default: '5' },
    accounts: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(`
Bear Lake Booker - Hybrid Capture Mode

Usage:
  npm run race -- [options]

Options:
  -d, --date <string>           Target arrival date (MM/DD/YYYY) [default: 07/08/2026]
  -l, --length <string>         Length of stay in nights [default: 6]
  -o, --loop <string>           Campground loop name [default: BIRCH]
  -c, --concurrency <number>    Number of parallel agents [default: 10]
  -m, --monitorInterval <mins>  Poll via HTTP every X minutes until an exact-date opening appears
  -t, --time <string>           Fire search at HH:MM:SS (enables pre-warm mode)
  -b, --book                    Continue to site Order Details and stop there
  --dryRun                      Open site details only; never continue to Order Details
  --headed                      Run with visible browser
  --bookingMode <single|multi>  Booking coordination mode [default: single]
  --maxHolds <number>           Max concurrent holds in multi mode [default: 1]
  --accounts <csv>              Comma-separated list of account names for multi-session balancing (e.g., lisa,jason)
  --profileMode <mode>          persistent or ephemeral contexts [default: persistent]
  --profileDir <dir>            Directory for agent persistent profiles [default: profiles]
  --resetProfiles               Delete existing persistent profiles before starting
  --screenshotOnWin             Capture screenshot upon successful booking
  --sequential                  Book sites one at a time in a single browser
  --sites <csv>                 Target specific sites (e.g., BH03,BH07,BH09)
  --snipe                       Direct URL sniping: bypass search, go straight to site URLs (requires --sites)
  --warmup <minutes>            Minutes before --time to launch and pre-warm browsers [default: 5]
  -h, --help                    Show help
  `);
  process.exit(0);
}

let TARGET_DATE = values.date!;
const STAY_LENGTH = values.length!;
const LOOP = values.loop!;
const CONCURRENCY = parseInt(values.concurrency!, 10);
const TARGET_TIME = values.time;
const MONITOR_INTERVAL_MINS = values.monitorInterval ? parseInt(values.monitorInterval, 10) : null;

if (TARGET_DATE.toLowerCase() === 'max') {
  TARGET_DATE = getDynamicMaxDate();
  console.log(`Dynamic date 'max' resolved to: ${TARGET_DATE}`);
} else if (TARGET_DATE.toLowerCase() === 'random') {
  TARGET_DATE = getDynamicRandomDate();
  console.log(`Dynamic date 'random' resolved to: ${TARGET_DATE}`);
}

const AUTO_BOOK = values.book!;
const DRY_RUN = values.dryRun!;
const IS_HEADED = values.headed!;
const BOOKING_MODE = (values.bookingMode === 'multi' ? 'multi' : 'single') as 'single' | 'multi';
const MAX_HOLDS = parseInt(values.maxHolds!, 10);
const PROFILE_MODE = values.profileMode!;
const PROFILE_DIR = values.profileDir!;
const RESET_PROFILES = values.resetProfiles!;
const SCREENSHOT_ON_WIN = values.screenshotOnWin!;
const SITE_ALLOWLIST: string[] = values.sites ? values.sites.split(',').map((s) => s.trim().toUpperCase()) : [];
const SNIPE_MODE = values.snipe!;
const WARMUP_MINUTES = parseInt(values.warmup!, 10);
const ACCOUNTS_LIST: string[] = values.accounts ? values.accounts.split(',').map((s) => s.trim()) : [];

type HoldRecord = {
  agentId: number;
  site: string;
  stage: SuccessStage;
  timestamp: string;
};

type RunState = {
  bookingMode: 'single' | 'multi';
  holds: HoldRecord[];
  heldSites: Set<string>;
  maxHolds: number;
  isClosed: boolean;
  winningAgentId: number | null;
};

const runState: RunState = {
  bookingMode: BOOKING_MODE,
  holds: [],
  heldSites: new Set(),
  maxHolds: MAX_HOLDS,
  isClosed: false,
  winningAgentId: null,
};

const activeContexts = new Map<number, BrowserContext>();
const activeBrowsers: any[] = [];

// Pre-warmed pages — created during warm-up, reused at fire time
const warmedPages = new Map<number, Page>();

function isSiteAlreadyHeld(siteId: string): boolean {
  return runState.heldSites.has(siteId);
}

function shouldStopAgent(agentId: number): boolean {
  if (runState.isClosed) {
    return runState.winningAgentId !== agentId;
  }
  return false;
}

function registerHold(agentId: number, siteId: string, stage: SuccessStage): boolean {
  if (runState.isClosed) return false;
  if (runState.heldSites.has(siteId)) return false;

  runState.heldSites.add(siteId);
  runState.holds.push({
    agentId,
    site: siteId,
    stage,
    timestamp: new Date().toISOString(),
  });

  notifySuccess(siteId, agentId, stage, TARGET_DATE, LOOP);
  return true;
}

async function claimSuccess(agentId: number, siteId: string, stage: SuccessStage): Promise<boolean> {
  const registered = registerHold(agentId, siteId, stage);
  if (!registered) return false;

  if (runState.bookingMode === 'single') {
    runState.isClosed = true;
    runState.winningAgentId = agentId;
    if (stage === 'order-details' && AUTO_BOOK && !DRY_RUN) await cancelRemainingAgents(agentId);
    return true;
  }

  if (runState.holds.length >= runState.maxHolds) {
    console.log(`Max holds reached. Closing agents.`);
    runState.isClosed = true;
    runState.winningAgentId = agentId;
    await cancelRemainingAgents(agentId);
  }
  return true;
}

async function cancelRemainingAgents(excludeAgentId: number) {
  for (const [agentId, context] of activeContexts.entries()) {
    if (agentId !== excludeAgentId) await context.close().catch(() => { });
  }
}

async function cleanupResources(browsers: any[]) {
  console.log('\nCleaning up resources...');
  for (const [, context] of activeContexts.entries()) {
    await context.close().catch(() => { });
  }
  for (const b of browsers) {
    if (b) await b.close().catch(() => { });
  }
}

// --- HTTP Availability Polling ---

async function waitForAvailability(): Promise<SiteAvailability[]> {
  for (; ;) {
    const result = await searchAvailability({
      date: TARGET_DATE,
      length: STAY_LENGTH,
      loop: LOOP,
    });

    if (result.exactDateMatches.length > 0) {
      return result.exactDateMatches;
    }

    const timestamp = new Date().toLocaleTimeString();
    if (!MONITOR_INTERVAL_MINS) {
      console.log(`[${timestamp}] No exact-date availability detected. Skipping browser launch.`);
      return [];
    }

    console.log(
      `[${timestamp}] No exact-date availability for ${TARGET_DATE}. Retrying in ${MONITOR_INTERVAL_MINS} minute(s).`,
    );
    await sleep(MONITOR_INTERVAL_MINS * 60_000);
  }
}

// --- Agent Execution ---

/**
 * Shared logic for securing a hold on a site.
 * Navigates from site details -> order details -> cart.
 */
async function holdSite(agentId: number, page: Page, siteId: string): Promise<boolean> {
  const label = `[Agent ${agentId}] `;
  if (shouldStopAgent(agentId) || isSiteAlreadyHeld(siteId)) return false;

  if (!AUTO_BOOK || DRY_RUN) {
    await claimSuccess(agentId, siteId, 'site-details');
    if (SCREENSHOT_ON_WIN) await page.screenshot({ path: `logs/agent-${agentId}-${siteId}-${Date.now()}.png` }).catch(() => { });
    if (IS_HEADED) await page.waitForEvent('close').catch(() => { });
    return true;
  }

  const secured = await executeBookingFlow(page, TARGET_DATE, STAY_LENGTH, label);
  if (secured) {
    await claimSuccess(agentId, siteId, 'order-details');
    const screenshotPath = `logs/cart-agent-${agentId}-${siteId}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath }).catch(() => { });
    console.log(`${label}✅ Final hold secured in Shopping Cart! Screenshot: ${screenshotPath}`);

    if (IS_HEADED) await page.waitForEvent('close').catch(() => { });
    return true;
  } else {
    const errorPath = `logs/fail-cart-agent-${agentId}-${siteId}-${Date.now()}.png`;
    await page.screenshot({ path: errorPath }).catch(() => { });
    console.log(`${label}Failed to secure hold in Shopping Cart. Screenshot: ${errorPath}`);
  }
  return false;
}

/**
 * Standard agent flow: submit pre-warmed search form, parse results, book.
 */
async function runAgent(agentId: number, page: Page, preferredSite: string | null) {
  try {
    const label = `[Agent ${agentId}] `;

    // Submit with retry loop
    const gotResults = await submitWithRetry(page, label);
    if (!gotResults) {
      // Fallback: single submit + standard wait
      await submitSearchForm(page);
      await waitForSearchResults(page);
    }

    let candidates = await resolveTargetSites(page, TARGET_DATE, STAY_LENGTH);
    if (preferredSite) {
      candidates.sort((a) => (a.site === preferredSite ? -1 : 1));
    } else if (candidates.length > 1) {
      // Offset agents so they don't all collide on the exact same first site
      const startIndex = (agentId - 1) % candidates.length;
      candidates = [...candidates.slice(startIndex), ...candidates.slice(0, startIndex)];
    }

    for (const selection of candidates) {
      if (shouldStopAgent(agentId)) break;
      if (isSiteAlreadyHeld(selection.site)) continue;

      if (await openSiteDetails(page, selection)) {
        if (await holdSite(agentId, page, selection.site)) return;
      }
    }
  } catch (error) {
    const msg = String(error);
    if (!msg.includes('Target page, context or browser has been closed')) {
      console.error(`[Agent ${agentId}] Error: ${error}`);
    }
  }
}

/**
 * Snipe agent flow: bypass search, go directly to site booking URL.
 */
async function runSnipeAgent(agentId: number, page: Page, siteId: string) {
  const label = `[Agent ${agentId}] `;
  try {
    const url = buildDirectSiteUrl(siteId, TARGET_DATE, STAY_LENGTH);
    console.log(`${label}Sniping ${siteId} → ${url}`);

    const loaded = await snipeDirectUrl(page, url, label);
    if (loaded) {
      await holdSite(agentId, page, siteId);
    } else {
      console.log(`${label}Failed to load site ${siteId} booking page.`);
    }
  } catch (error) {
    const msg = String(error);
    if (!msg.includes('Target page, context or browser has been closed')) {
      console.error(`${label}Error: ${error}`);
    }
  }
}

function getAgentSessionFile(agentId: number): string {
  if (ACCOUNTS_LIST.length === 0) return getSessionFile(undefined);
  const index = (agentId - 1) % ACCOUNTS_LIST.length;
  return getSessionFile(ACCOUNTS_LIST[index]);
}

function getAgentSessionPath(agentId: number): string {
  if (ACCOUNTS_LIST.length === 0) return getSessionPath(undefined);
  const index = (agentId - 1) % ACCOUNTS_LIST.length;
  return getSessionPath(ACCOUNTS_LIST[index]);
}

async function createContextForAgent(agentId: number, browser: any | null): Promise<BrowserContext> {
  const label = `[Agent ${agentId}] `;
  const sessionFile = getAgentSessionFile(agentId);
  const sessionPath = getAgentSessionPath(agentId);
  const themeArgs = getThemeArgs(sessionFile);
  const options: any = { headless: !IS_HEADED, timezoneId: 'America/Denver', args: themeArgs };

  let context: BrowserContext;
  if (PROFILE_MODE === 'persistent') {
    const path = `${PROFILE_DIR}/agent-${agentId}`;
    context = await chromium.launchPersistentContext(path, options);
    if (fs.existsSync(sessionPath)) {
      console.log(`${label}Refreshing session state using ${sessionFile}...`);
      await injectSessionState(context, sessionPath);
    }
  } else {
    if (fs.existsSync(sessionPath)) {
      options.storageState = sessionPath;
      console.log(`${label}Loaded session from ${sessionFile}`);
    } else {
      console.log(`${label}No existing session file found at ${sessionFile}`);
    }
    context = await browser.newContext(options);
  }
  return context;
}

// --- Pre-Warm / Fire Pipeline ---

/**
 * Phase 1: Launch browsers, inject sessions, navigate to park page,
 * fill search forms. Returns pre-warmed pages ready to fire.
 */
async function warmUpAgents(targetSites: string[]): Promise<void> {
  if (PROFILE_MODE === 'persistent' && !fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  let sharedBrowser: any = null;
  if (PROFILE_MODE !== 'persistent') {
    sharedBrowser = await chromium.launch({ headless: !IS_HEADED });
    activeBrowsers.push(sharedBrowser);
  }

  for (let i = 0; i < CONCURRENCY; i++) {
    const agentId = i + 1;
    const label = `[Agent ${agentId}] `;

    const sessionFile = getAgentSessionFile(agentId);
    const accountName = ACCOUNTS_LIST[(agentId - 1) % ACCOUNTS_LIST.length];
    const { isExpired, earliestExpiry } = getSessionExpiryInfo(accountName);

    if (isExpired) {
      console.error(`${label}⚠️  WARNING: Local session file is expired or missing. Attempting auto-login...`);
      try {
        await performAutoLogin(accountName ? [accountName] : []);
      } catch (e: any) {
        console.error(`${label}❌ Auto-login failed: ${e.message}`);
        process.exit(1);
      }
    } else if (earliestExpiry) {
      console.log(`${label}Session valid until: ${earliestExpiry.toLocaleString()}`);
    }

    const context = await createContextForAgent(agentId, sharedBrowser);

    activeContexts.set(agentId, context);

    const page = await context.newPage();
    warmedPages.set(agentId, page);

    await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });
    let loggedIn = await ensureLoggedIn(page, label);
    if (!loggedIn) {
      console.error(`\n⚠️  WARNING: Server rejected session for Agent ${agentId}. Attempting auto-login...\n`);
      try {
        await performAutoLogin(accountName ? [accountName] : []);
        // Re-inject the fresh session into the existing context
        await injectSessionState(context, getAgentSessionPath(agentId));
        await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });
        loggedIn = await ensureLoggedIn(page, label);
        if (!loggedIn) throw new Error('Auto-login succeeded but session still invalid.');
      } catch (e: any) {
        console.error(`\n❌ CRITICAL ERROR: Auto-login failed for Agent ${agentId}: ${e.message}\n`);
        process.exit(1);
      }
    }

    // Start background heartbeat to keep JSESSIONID alive until fire time
    await startHeartbeat(page, label);

    if (!SNIPE_MODE) {
      await primeSearchForm(page, LOOP, TARGET_DATE, STAY_LENGTH, label);
      console.log(`${label}✅ Pre-warmed and ready. Form filled.`);
    } else {
      console.log(`${label}✅ Pre-warmed. Will snipe ${targetSites[i] ?? 'first available'} at fire time.`);
    }
  }
}

/**
 * Phase 2: Fire all agents simultaneously.
 * Called at --time after pre-warm is complete.
 */
async function fireAgents(targetSites: string[]): Promise<void> {
  console.log(`\n🔥 FIRING ${CONCURRENCY} agents! (${new Date().toISOString()})\n`);

  // Pre-warm connections 10s before fire (already at fire time if no --time)
  const preWarmPromises: Promise<void>[] = [];
  for (const [agentId, page] of warmedPages.entries()) {
    preWarmPromises.push(preWarmConnections(page, `[Agent ${agentId}] `));
  }
  await Promise.all(preWarmPromises);

  const promises: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const agentId = i + 1;
    const page = warmedPages.get(agentId);
    if (!page) continue;

    if (SNIPE_MODE) {
      const siteId = targetSites[i];
      if (!siteId) {
        console.log(`[Agent ${agentId}] No site assigned for sniping — skipping.`);
        continue;
      }
      // Stagger by 50ms to avoid exact-same-millisecond collision
      promises.push(sleep(i * 50).then(() => runSnipeAgent(agentId, page, siteId)));
    } else {
      // Standard mode: submit the pre-filled form
      promises.push(sleep(i * 50).then(() => runAgent(agentId, page, targetSites[i] ?? null)));
    }
  }

  await Promise.all(promises);

  await cleanupResources(activeBrowsers);

  writeRunSummary({
    timestamp: new Date().toISOString(),
    targetDate: TARGET_DATE,
    loop: LOOP,
    agentCount: CONCURRENCY,
    bookingMode: BOOKING_MODE,
    maxHolds: MAX_HOLDS,
    holds: runState.holds,
    winningAgent: runState.winningAgentId,
    winningSite: runState.holds[0]?.site ?? null,
    status: runState.holds.length > 0 ? 'success' : 'failure',
  });
}

// --- Legacy Launch (non-timed mode) ---

async function launchCapture(targetSites: string[]) {
  if (PROFILE_MODE === 'persistent' && !fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  let sharedBrowser: any = null;
  if (PROFILE_MODE !== 'persistent') {
    sharedBrowser = await chromium.launch({ headless: !IS_HEADED });
    activeBrowsers.push(sharedBrowser);
  }

  const promises: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const agentId = i + 1;
    const agent = async () => {
      const label = `[Agent ${agentId}] `;
      const context = await createContextForAgent(agentId, sharedBrowser);
      activeContexts.set(agentId, context);
      const page = await context.newPage();

      const sessionFile = getAgentSessionFile(agentId);
      const accountName = ACCOUNTS_LIST[(agentId - 1) % ACCOUNTS_LIST.length];

      try {
        await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });
        let loggedIn = await ensureLoggedIn(page, label);
        if (!loggedIn) {
          console.error(`\n⚠️  WARNING: Server rejected session for Agent ${agentId}. Attempting auto-login...\n`);
          try {
            await performAutoLogin(accountName ? [accountName] : []);
            // Re-inject the fresh session into the existing context
            await injectSessionState(context, getAgentSessionPath(agentId));
            await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });
            loggedIn = await ensureLoggedIn(page, label);
            if (!loggedIn) throw new Error('Auto-login succeeded but session still invalid.');
          } catch (e: any) {
            console.error(`\n❌ CRITICAL ERROR: Auto-login failed for Agent ${agentId}: ${e.message}\n`);
            process.exit(1);
          }
        }
        await primeSearchForm(page, LOOP, TARGET_DATE, STAY_LENGTH, label);
        await runAgent(agentId, page, targetSites[i] ?? null);
      } finally {
        await context.close().catch(() => { });
      }
    };

    promises.push(sleep(i * 300).then(agent));
  }

  await Promise.all(promises);
  await cleanupResources(activeBrowsers);

  writeRunSummary({
    timestamp: new Date().toISOString(),
    targetDate: TARGET_DATE,
    loop: LOOP,
    agentCount: CONCURRENCY,
    bookingMode: BOOKING_MODE,
    maxHolds: MAX_HOLDS,
    holds: runState.holds,
    winningAgent: runState.winningAgentId,
    winningSite: runState.holds[0]?.site ?? null,
    status: runState.holds.length > 0 ? 'success' : 'failure',
  });
}

// --- Entry Point ---

async function validateAllSessionsUpfront() {
  console.log('\n[Init] Validating session state for all accounts before starting...');
  const accountsToCheck = ACCOUNTS_LIST.length > 0 ? ACCOUNTS_LIST : [undefined];
  const accountsToLogin: string[] = [];

  for (const account of accountsToCheck) {
    const { isExpired } = getSessionExpiryInfo(account);
    if (isExpired) {
      accountsToLogin.push(account || 'default');
    }
  }

  if (accountsToLogin.length > 0) {
    console.log(`[Init] Sessions expired or missing for: ${accountsToLogin.join(', ')}. Launching Auth fallback...`);
    try {
      await performAutoLogin(accountsToLogin);
    } catch (e: any) {
      console.error(`\n❌ CRITICAL ERROR: Initial authentication failed: ${e.message}\n`);
      process.exit(1);
    }
  } else {
    console.log('[Init] ✅ All required sessions are currently valid.');
  }
}

async function startRace() {
  console.log('--- Bear Lake Sniper Mode ---');
  if (!TARGET_DATE) throw new Error("Target date is required.");
  assertBookingWindow(TARGET_DATE);
  // --- FLOWCHART: Ensure Valid Session ---
  await validateAllSessionsUpfront();

  // --- SAFETY WARNINGS ---
  if (!AUTO_BOOK && !DRY_RUN) {
    console.log('\x1b[43m\x1b[30m ⚠️  WARNING: DRY RUN MODE. Sites will NOT be added to your cart. \x1b[0m');
    console.log(' You forgot the -b (--book) flag. The script will stop at the Site Details page.\n');
  } else if (DRY_RUN) {
    console.log('\x1b[43m\x1b[30m ⚠️  WARNING: DRY RUN MODE. Sites will NOT be added to your cart. \x1b[0m');
    console.log(' --dryRun is enabled. The script will stop at the Site Details page.\n');
  } else {
    console.log('\x1b[42m\x1b[30m 🏁 AUTO-BOOK ACTIVE. Agents will attempt to add sites to your cart. \x1b[0m\n');
  }

  if (!IS_HEADED) {
    console.log('\x1b[41m\x1b[37m 🚨 DANGER: HEADLESS MODE ACTIVE \x1b[0m');
    console.log('\x1b[31m You forgot the --headed flag. If ReserveAmerica triggers a Captcha, the agents will silently hang and fail.\x1b[0m\n');
  }
  // -----------------------

  if (TARGET_TIME) {
    // === PRE-WARM PIPELINE ===
    const msUntilFire = msUntilTargetTime(TARGET_TIME);
    const warmupMs = WARMUP_MINUTES * 60_000;

    if (msUntilFire <= 0) {
      console.log(`Target time ${TARGET_TIME} has already passed. Launching immediately.`);
      await warmUpAgents(SITE_ALLOWLIST);
      await fireAgents(SITE_ALLOWLIST);
      return;
    }

    // Wait until warmup window opens
    const waitBeforeWarmup = msUntilFire - warmupMs;
    if (waitBeforeWarmup > 0) {
      console.log(`Waiting ${Math.round(waitBeforeWarmup / 1000)}s until warm-up window opens...`);
      await sleep(waitBeforeWarmup);
    }

    console.log(`\n🔧 WARM-UP PHASE: Launching ${CONCURRENCY} agents...`);
    await warmUpAgents(SITE_ALLOWLIST);

    // Countdown with logging
    const remaining = msUntilTargetTime(TARGET_TIME);
    if (remaining > 10_000) {
      console.log(`\n⏳ All agents pre-warmed. Waiting ${Math.round(remaining / 1000)}s until fire time (${TARGET_TIME})...`);
    }

    // Pre-warm connections at T-10s
    const preWarmDelay = remaining - 10_000;
    if (preWarmDelay > 0) {
      await sleep(preWarmDelay);
      console.log(`\n🌐 T-10s: Pre-warming connections...`);
      for (const [agentId, page] of warmedPages.entries()) {
        await preWarmConnections(page, `[Agent ${agentId}] `);
      }
    }

    // High-res wait for exact fire time
    await waitForTargetTime(TARGET_TIME);
    await fireAgents(SITE_ALLOWLIST);
    return;
  }

  // === HYBRID MODE (HTTP monitor → browser launch) ===
  const result = await waitForAvailability();
  if (result.length > 0) {
    let targetSites = result.map((s) => s.site);
    if (SITE_ALLOWLIST.length > 0) {
      targetSites = targetSites.filter((s) => SITE_ALLOWLIST.includes(s.toUpperCase()));
      if (targetSites.length === 0) {
        console.log('No available sites match your --sites allowlist.');
        process.exit(2);
      }
    }
    await launchCapture(targetSites);
  } else {
    process.exit(2); // Exit with a specific code so the CLI wrapper knows no sites were targeted
  }
}

startRace().catch(console.error);
