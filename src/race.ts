import { type BrowserContext, type Page } from 'playwright';
import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());
import { parseArgs } from 'util';
import * as fs from 'fs';
import { searchAvailability, type SiteAvailability } from './reserveamerica';
import { PARK_URL, SESSION_FILE, USER_AGENTS } from './config';
import { notifySuccess, type SuccessStage } from './notify';
import { writeRunSummary } from './reporter';
import {
  sleep,
  ensureLoggedIn,
  primeSearchForm,
  submitSearchForm,
  waitForSearchResults,
  resolveTargetSites,
  openSiteDetails,
  continueToOrderDetails,
  addToCart,
  injectSession,
} from './automation';

const { values } = parseArgs({
  options: {
    date: { type: 'string', short: 'd', default: '07/22/2026' },
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
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  console.log(`
Bear Lake Booker - Hybrid Capture Mode

Usage:
  npm run race -- [options]

Options:
  -d, --date <string>           Target arrival date (MM/DD/YYYY) [default: 07/22/2026]
  -l, --length <string>         Length of stay in nights [default: 6]
  -o, --loop <string>           Campground loop name [default: BIRCH]
  -c, --concurrency <number>    Number of parallel agents [default: 10]
  -m, --monitorInterval <mins>  Poll via HTTP every X minutes until an exact-date opening appears
  -t, --time <string>           Fire search at HH:MM:SS without HTTP preflight
  -b, --book                    Continue to site Order Details and stop there
  --dryRun                      Open site details only; never continue to Order Details
  --headed                      Run with visible browser
  --bookingMode <single|multi>  Booking coordination mode [default: single]
  --maxHolds <number>           Max concurrent holds in multi mode [default: 1]
  --profileMode <mode>          persistent or ephemeral contexts [default: persistent]
  --profileDir <dir>            Directory for agent persistent profiles [default: profiles]
  --resetProfiles               Delete existing persistent profiles before starting
  --screenshotOnWin             Capture screenshot upon successful booking
  --sequential                  Book sites one at a time in a single browser
  --sites <csv>                 Target specific sites (e.g., BH03,BH07,BH09)
  -h, --help                    Show help
  `);
  process.exit(0);
}

const TARGET_DATE = values.date!;
const STAY_LENGTH = values.length!;
const LOOP = values.loop!;
const CONCURRENCY = parseInt(values.concurrency!, 10);
const TARGET_TIME = values.time;
const MONITOR_INTERVAL_MINS = values.monitorInterval ? parseInt(values.monitorInterval, 10) : null;
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
    if (agentId !== excludeAgentId) await context.close().catch(() => {});
  }
}

async function waitForTargetTime(targetTimeStr: string) {
  const [targetHours = 0, targetMinutes = 0, targetSeconds = 0] = targetTimeStr.split(':').map(Number);
  console.log(`Waiting for ${targetTimeStr}...`);

  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === targetHours && now.getMinutes() === targetMinutes && now.getSeconds() >= targetSeconds) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

async function waitForAvailability(): Promise<SiteAvailability[]> {
  for (;;) {
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

async function runAgent(agentId: number, context: BrowserContext, preferredSite: string | null) {
  activeContexts.set(agentId, context);
  const page = await context.newPage();
  try {
    const label = `[Agent ${agentId}] `;

    await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });
    await ensureLoggedIn(page, label);

    await primeSearchForm(page, LOOP, TARGET_DATE, STAY_LENGTH, label);
    if (TARGET_TIME) await waitForTargetTime(TARGET_TIME);
    await sleep(Math.random() * 200);
    await submitSearchForm(page);
    await waitForSearchResults(page);

    const candidates = await resolveTargetSites(page, TARGET_DATE, STAY_LENGTH);
    if (preferredSite) candidates.sort((a) => (a.site === preferredSite ? -1 : 1));

    for (const selection of candidates) {
      if (shouldStopAgent(agentId)) break;
      if (isSiteAlreadyHeld(selection.site)) continue;

      if (await openSiteDetails(page, selection)) {
        if (isSiteAlreadyHeld(selection.site)) continue;

        if (!AUTO_BOOK || DRY_RUN) {
          await claimSuccess(agentId, selection.site, 'site-details');
          if (SCREENSHOT_ON_WIN) await page.screenshot({ path: `logs/agent-${agentId}-win-${Date.now()}.png` }).catch(() => {});
          if (IS_HEADED) await page.waitForEvent('close').catch(() => {});
          return;
        }

        if (await continueToOrderDetails(page, TARGET_DATE, STAY_LENGTH)) {
          console.log(`${label}Reached Order Details for ${selection.site}. Finalizing hold...`);

          if (await addToCart(page, label)) {
            await claimSuccess(agentId, selection.site, 'order-details');
            const screenshotPath = `logs/cart-agent-${agentId}-${selection.site}-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath }).catch(() => {});
            console.log(`${label}✅ Final hold secured in Shopping Cart! Screenshot: ${screenshotPath}`);

            if (IS_HEADED) await page.waitForEvent('close').catch(() => {});
            return;
          } else {
            const errorPath = `logs/fail-cart-agent-${agentId}-${selection.site}-${Date.now()}.png`;
            await page.screenshot({ path: errorPath }).catch(() => {});
            console.log(`${label}Failed to move to Shopping Cart. Screenshot: ${errorPath}`);
          }
        }
      }
    }
  } catch (error) {
    console.error(`[Agent ${agentId}] Error: ${error}`);
  } finally {
    await context.close().catch(() => {});
  }
}

async function launchCapture(targetSites: string[]) {
  const hasSession = fs.existsSync(SESSION_FILE);
  if (PROFILE_MODE === 'persistent') {
    if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  let browser: any = null;
  if (PROFILE_MODE !== 'persistent') browser = await chromium.launch({ headless: !IS_HEADED });

  const promises: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    const agentId = i + 1;
    let context: BrowserContext;

    if (PROFILE_MODE === 'persistent') {
      const path = `${PROFILE_DIR}/agent-${agentId}`;
      const options = { headless: !IS_HEADED, timezoneId: 'America/Denver' };
      context = await chromium.launchPersistentContext(path, options);
      if (hasSession) {
        console.log(`[Agent ${agentId}] Refreshing session state...`);
        await injectSession(context);
      }
    } else {
      context = await browser!.newContext({
        storageState: hasSession ? SESSION_FILE : undefined,
        timezoneId: 'America/Denver',
      });
    }
    promises.push(sleep(i * 300).then(() => runAgent(agentId, context, targetSites[i] ?? null)));
  }

  await Promise.all(promises);
  if (browser) await browser.close();
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

async function startRace() {
  console.log('--- Bear Lake Sniper Mode ---');
  if (TARGET_TIME) {
    await launchCapture([]);
    return;
  }

  const result = await waitForAvailability();
  if (result.length > 0) {
    let targetSites = result.map((s) => s.site);
    if (SITE_ALLOWLIST.length > 0) {
      targetSites = targetSites.filter((s) => SITE_ALLOWLIST.includes(s.toUpperCase()));
      if (targetSites.length === 0) {
        console.log('No available sites match your --sites allowlist.');
        return;
      }
    }
    await launchCapture(targetSites);
  }
}

startRace().catch(console.error);
