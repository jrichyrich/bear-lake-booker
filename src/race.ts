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
const SEQUENTIAL = values.sequential!;
const SITE_ALLOWLIST: string[] = values.sites ? values.sites.split(',').map(s => s.trim().toUpperCase()) : [];

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

type SiteSelection = {
  site: string;
  detailsUrl: string;
  actionText: string;
};

const ALLOWED_ROW_ACTIONS = new Set(['SEE DETAILS', 'ENTER DATE']);
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
  if (runState.isClosed) {
    return false;
  }

  if (runState.heldSites.has(siteId)) {
    console.log(`[Agent ${agentId}] Site ${siteId} is already held. Skipping.`);
    return false;
  }

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
  if (!registered) {
    return false;
  }

  if (runState.bookingMode === 'single') {
    // Single mode: first win closes everything
    runState.isClosed = true;
    runState.winningAgentId = agentId;

    if (stage === 'order-details' && AUTO_BOOK && !DRY_RUN) {
      await cancelRemainingAgents(agentId);
    }
    return true;
  }

  // Multi mode: keep going until maxHolds reached
  if (runState.holds.length >= runState.maxHolds) {
    console.log(`Max holds (${runState.maxHolds}) reached. Closing remaining agents.`);
    runState.isClosed = true;
    runState.winningAgentId = agentId;
    await cancelRemainingAgents(agentId);
  }

  return true;
}

async function cancelRemainingAgents(excludeAgentId: number) {
  const closePromises: Array<Promise<void>> = [];

  for (const [agentId, context] of activeContexts.entries()) {
    if (agentId === excludeAgentId) {
      continue;
    }

    console.log(`[Agent ${agentId}] Cancelling (hold cap reached or single-winner).`);
    closePromises.push(
      context.close().catch(() => { }),
    );
  }

  await Promise.all(closePromises);
}

async function waitForTargetTime(targetTimeStr: string) {
  const [targetHours = 0, targetMinutes = 0, targetSeconds = 0] = targetTimeStr.split(':').map(Number);
  console.log(`Waiting for ${targetTimeStr}...`);

  return new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      const now = new Date();
      if (
        now.getHours() === targetHours &&
        now.getMinutes() === targetMinutes &&
        now.getSeconds() >= targetSeconds
      ) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

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

async function runAgent(agentId: number, context: BrowserContext, targetSite: string | null) {
  activeContexts.set(agentId, context);
  const page = await context.newPage();

  try {
    const label = `[Agent ${agentId}] `;
    console.log(`${label}Priming search form...`);
    await primeSearchForm(page, label);

    if (TARGET_TIME) {
      await waitForTargetTime(TARGET_TIME);
    }

    const jitterMs = Math.floor(Math.random() * 150);
    await sleep(jitterMs);

    console.log(`[Agent ${agentId}] Submitting search (+${jitterMs}ms).`);
    await submitSearchForm(page);
    await waitForSearchResults(page);

    if (shouldStopAgent(agentId)) {
      return;
    }

    const selection = await openTargetSite(page, targetSite, label);
    if (!selection) {
      console.log(`[Agent ${agentId}] No target site details page could be opened.`);
      return;
    }

    if (isSiteAlreadyHeld(selection.site)) {
      console.log(`[Agent ${agentId}] Site ${selection.site} is already held by another agent. Skipping.`);
      return;
    }

    console.log(`[Agent ${agentId}] Opened site ${selection.site} via ${selection.actionText || 'site details'}.`);

    if (!AUTO_BOOK || DRY_RUN) {
      if (DRY_RUN) {
        console.log(`[Agent ${agentId}] Dry run enabled. Stopping on site details for ${selection.site}.`);
      }
      if (SCREENSHOT_ON_WIN) {
        await page.screenshot({ path: `logs/agent-${agentId}-win-${Date.now()}.png` }).catch(() => { });
      }
      await claimSuccess(agentId, selection.site, 'site-details');
      await holdBrowserIfNeeded(page, agentId);
      return;
    }

    if (shouldStopAgent(agentId)) {
      return;
    }

    const booked = await continueToOrderDetails(page);
    if (booked) {
      const isWinner = await claimSuccess(agentId, selection.site, 'order-details');
      if (!isWinner) {
        return;
      }
      if (SCREENSHOT_ON_WIN) {
        await page.screenshot({ path: `logs/agent-${agentId}-win-${Date.now()}.png` }).catch(() => { });
      }
      await holdBrowserIfNeeded(page, agentId);
    } else {
      console.log(`[Agent ${agentId}] Opened ${selection.site}, but did not reach Order Details.`);
    }
  } catch (error) {
    if (!runState.isClosed) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      console.error(`[Agent ${agentId}] ${message}`);
      await page.screenshot({ path: `agent-${agentId}-error.png` }).catch(() => { });
    }
  } finally {
    activeContexts.delete(agentId);
    await page.close().catch(() => { });
    await context.close().catch(() => { });
  }
}

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 5000;

async function isErrorPage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = (document.body.textContent ?? '').toLowerCase();
    return text.includes('oops') || text.includes('experiencing some difficulties');
  });
}

async function primeSearchForm(page: Page, agentLabel = ''): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });

    if (await isErrorPage(page)) {
      console.log(`${agentLabel}Error page detected. Retry ${attempt}/${MAX_RETRIES} in ${RETRY_BACKOFF_MS / 1000}s...`);
      await sleep(RETRY_BACKOFF_MS);
      continue;
    }

    try {
      await page.waitForSelector('#unifSearchForm', { timeout: 15000 });
      break; // Success — form found
    } catch {
      if (attempt < MAX_RETRIES) {
        console.log(`${agentLabel}Search form not found. Retry ${attempt}/${MAX_RETRIES} in ${RETRY_BACKOFF_MS / 1000}s...`);
        await sleep(RETRY_BACKOFF_MS);
      } else {
        throw new Error('Search form not found after all retries.');
      }
    }
  }

  await page.evaluate(
    ({ loop, date, length }) => {
      const loopSelect = document.querySelector<HTMLSelectElement>('#loop');
      const dateInput = document.querySelector<HTMLInputElement>('#campingDate');
      const stayInput = document.querySelector<HTMLInputElement>('#lengthOfStay');
      const form = document.querySelector<HTMLFormElement>('#unifSearchForm');

      if (!loopSelect) {
        throw new Error('Loop selector not found.');
      }
      if (!dateInput) {
        throw new Error('Arrival date input not found.');
      }
      if (!stayInput) {
        throw new Error('Length of stay input not found.');
      }
      if (!form) {
        throw new Error('Search form not found.');
      }

      const option = Array.from(loopSelect.options).find(
        (candidate) => candidate.textContent?.trim().toUpperCase() === loop.toUpperCase(),
      );

      if (!option || !option.value) {
        throw new Error(`Loop "${loop}" not found in form options.`);
      }

      loopSelect.value = option.value;
      loopSelect.dispatchEvent(new Event('change', { bubbles: true }));

      dateInput.value = date;
      dateInput.dispatchEvent(new Event('input', { bubbles: true }));
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));

      stayInput.value = length;
      stayInput.dispatchEvent(new Event('input', { bubbles: true }));
      stayInput.dispatchEvent(new Event('change', { bubbles: true }));
    },
    {
      loop: LOOP,
      date: TARGET_DATE,
      length: STAY_LENGTH,
    },
  );
}

async function submitSearchForm(page: Page) {
  const navigation = page.waitForNavigation({
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  }).catch(() => null);

  await page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('#unifSearchForm');
    if (!form) {
      throw new Error('Search form not found.');
    }

    const engine = (window as Window & {
      UnifSearchEngine?: {
        submitForm?: () => void;
      };
    }).UnifSearchEngine;

    if (engine?.submitForm) {
      engine.submitForm();
    }

    form.submit();
  });

  await navigation;
}

async function waitForSearchResults(page: Page) {
  await page.waitForFunction(
    () => {
      const dateInput = document.querySelector<HTMLInputElement>('#campingDate');
      const bodyText = document.body.textContent ?? '';
      const hasCalendarRows = document.querySelectorAll('#calendar .br').length > 0;
      const hasSummaryState =
        bodyText.includes('0 site(s) available') ||
        bodyText.includes('Arrival date may be beyond Reservation Window') ||
        bodyText.includes('Create Availability Notification');

      return Boolean(dateInput) && (hasCalendarRows || hasSummaryState);
    },
    {
      timeout: 15000,
    },
  );
}

async function openTargetSite(page: Page, preferredSite: string | null, agentLabel = ''): Promise<SiteSelection | null> {
  const selection = await resolveTargetSite(page, preferredSite);
  if (!selection) {
    return null;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await page.goto(selection.detailsUrl, { waitUntil: 'domcontentloaded' });

    if (await isErrorPage(page)) {
      if (attempt < MAX_RETRIES) {
        console.log(`${agentLabel}Error page on site details. Retry ${attempt}/${MAX_RETRIES} in 3s...`);
        await sleep(3000);
        continue;
      }
      console.log(`${agentLabel}Error page persisted after ${MAX_RETRIES} retries for ${selection.site}.`);
      return null;
    }

    try {
      await page.waitForFunction(
        () =>
          Boolean(document.querySelector('#booksiteform')) ||
          Boolean(document.querySelector('#arrivaldate')) ||
          (document.body.textContent ?? '').includes('No suitable availability shown'),
        { timeout: 15000 },
      );
      return selection;
    } catch {
      if (attempt < MAX_RETRIES) {
        console.log(`${agentLabel}Site details page didn't load. Retry ${attempt}/${MAX_RETRIES} in 3s...`);
        await sleep(3000);
      } else {
        console.log(`${agentLabel}Site details timed out after ${MAX_RETRIES} retries for ${selection.site}.`);
        return null;
      }
    }
  }

  return null;
}

async function resolveTargetSite(page: Page, preferredSite: string | null): Promise<SiteSelection | null> {
  const candidates = await page.evaluate(
    ({ targetDate, stayLength, allowedActions }) =>
      Array.from(document.querySelectorAll<HTMLDivElement>('.br'))
        .map((row) => {
          const siteLink = row.querySelector<HTMLAnchorElement>('.siteListLabel a[href*="campsiteDetails.do"]');
          if (!siteLink) {
            return null;
          }

          const actionLink = row.querySelector<HTMLAnchorElement>('.td[class*="sitescompareselectorbtn"] a');
          const actionText = actionLink?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

          if (!actionLink || !allowedActions.includes(actionText.toUpperCase())) {
            return null;
          }

          const detailsUrl = new URL(siteLink.href, window.location.href);

          detailsUrl.searchParams.set('arvdate', targetDate);
          detailsUrl.searchParams.set('lengthOfStay', stayLength);

          return {
            site: siteLink.textContent?.trim() ?? '',
            actionText,
            detailsUrl: detailsUrl.toString(),
          };
        })
        .filter((candidate): candidate is SiteSelection => Boolean(candidate?.site)),
    {
      targetDate: TARGET_DATE,
      stayLength: STAY_LENGTH,
      allowedActions: Array.from(ALLOWED_ROW_ACTIONS),
    },
  );

  if (preferredSite) {
    const preferred = candidates.find((candidate) => candidate.site === preferredSite);
    if (preferred) {
      return preferred;
    }
  }

  return candidates[0] ?? null;
}

async function continueToOrderDetails(page: Page): Promise<boolean> {
  const readyToBook = await prepareSiteForBooking(page);
  if (!readyToBook) {
    return false;
  }

  const bookButton = page
    .locator('#btnbookdates, #btnbooknow, button:has-text("Book these Dates"), button:has-text("Book Now")')
    .first();

  if ((await bookButton.count()) === 0) {
    return false;
  }

  const navigation = page.waitForNavigation({
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  }).catch(() => null);

  await bookButton.click();
  await navigation;

  return waitForOrderDetails(page);
}

async function prepareSiteForBooking(page: Page): Promise<boolean> {
  if (await isReadyToBook(page)) {
    return true;
  }

  if ((await page.locator('#arrivaldate').count()) === 0 || (await page.locator('#lengthOfStay').count()) === 0) {
    return false;
  }

  await page.locator('#arrivaldate').fill(TARGET_DATE);
  await page.locator('#lengthOfStay').fill(STAY_LENGTH);

  const submitButton = page.locator('#btnbookdates').first();
  if ((await submitButton.count()) === 0) {
    return false;
  }

  const navigation = page.waitForNavigation({
    waitUntil: 'domcontentloaded',
    timeout: 15000,
  }).catch(() => null);

  await submitButton.click();
  await navigation;

  return isReadyToBook(page);
}

async function isReadyToBook(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const form = document.querySelector<HTMLFormElement>('#booksiteform');
    const action = form?.getAttribute('action') ?? '';
    const dateChosen = document.querySelector<HTMLInputElement>('#dateChosen')?.value ?? '';
    const buttonText = document.querySelector<HTMLButtonElement>('#btnbookdates')?.textContent?.trim() ?? '';
    const bodyText = document.body.textContent ?? '';

    if (bodyText.includes('No suitable availability shown')) {
      return false;
    }

    return action.includes('/switchBookingAction.do') && dateChosen === 'true' && /book/i.test(buttonText);
  });
}

async function waitForOrderDetails(page: Page): Promise<boolean> {
  const reached = await page
    .waitForFunction(
      () =>
        window.location.pathname.includes('/switchBookingAction.do') ||
        Boolean(document.querySelector('#reservedetail')) ||
        (document.body.textContent ?? '').includes('Order Details'),
      {
        timeout: 15000,
      },
    )
    .then(() => true)
    .catch(() => false);

  if (!reached) {
    return false;
  }

  return page.evaluate(() => {
    const bodyText = document.body.textContent ?? '';
    return bodyText.includes('Order Details') || Boolean(document.querySelector('#reservedetail'));
  });
}

async function holdBrowserIfNeeded(page: Page, agentId: number) {
  if (!IS_HEADED) {
    return;
  }

  if (AUTO_BOOK && !DRY_RUN) {
    console.log(`[Agent ${agentId}] Browser will stay open until you close it. Proceed to checkout manually.`);
    await page.waitForEvent('close').catch(() => { });
  } else {
    console.log(`[Agent ${agentId}] Keeping browser open for 30 seconds.`);
    await page.waitForTimeout(30_000);
  }
}

function buildContextOptions(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  index: number,
  hasSession: boolean,
): NonNullable<Parameters<typeof browser.newContext>[0]> {
  const userAgent = USER_AGENTS[index % USER_AGENTS.length] ?? USER_AGENTS[0] ?? 'Mozilla/5.0';
  const contextOptions: NonNullable<Parameters<typeof browser.newContext>[0]> = {
    userAgent,
    timezoneId: 'America/Denver',
  };

  if (hasSession) {
    contextOptions.storageState = SESSION_FILE;
  }

  return contextOptions;
}

async function prepareProfileDir() {
  if (PROFILE_MODE !== 'persistent') return;
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    console.log(`Created profile directory: ${PROFILE_DIR}`);
  }

  if (RESET_PROFILES) {
    console.log(`Resetting profile directory: ${PROFILE_DIR}`);
    fs.rmSync(PROFILE_DIR, { recursive: true, force: true });
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
}

async function launchCapture(targetSites: string[]) {
  activeContexts.clear();
  runState.winningAgentId = null;
  runState.isClosed = false;
  runState.holds = [];
  runState.heldSites.clear();
  const hasSession = fs.existsSync(SESSION_FILE);

  if (!hasSession) {
    console.warn('WARNING: session.json not found. Capture will run as guest.');
  } else {
    console.log('Authentication session loaded.');
  }

  if (AUTO_BOOK && !hasSession) {
    console.warn('AUTO_BOOK is enabled, but no saved session is present. Booking may stop at login.');
  }

  if (DRY_RUN) {
    console.log('Dry-run capture is enabled. Agents will stop on site details and never continue to Order Details.');
  }

  if (BOOKING_MODE === 'multi') {
    console.log(`Multi-hold mode enabled. Max holds: ${MAX_HOLDS}.`);
  }

  await prepareProfileDir();

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  if (PROFILE_MODE !== 'persistent') {
    browser = await chromium.launch({ headless: !IS_HEADED });
  }

  const agentPromises: Array<Promise<void>> = [];

  for (let index = 0; index < CONCURRENCY; index += 1) {
    const agentId = index + 1;
    let context: BrowserContext;

    if (PROFILE_MODE === 'persistent') {
      const profilePath = `${PROFILE_DIR}/agent-${agentId}`;
      const contextOptions = buildContextOptions({} as any, index, false);

      const persistentOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
        headless: !IS_HEADED,
      };

      if (contextOptions.userAgent) {
        persistentOptions.userAgent = contextOptions.userAgent;
      }

      if (contextOptions.timezoneId) {
        persistentOptions.timezoneId = contextOptions.timezoneId;
      }

      if (hasSession && !fs.existsSync(profilePath)) {
        console.log(`[Agent ${agentId}] Seeding new persistent profile from session.json`);

        // Load the external storage state if the profile is new
        const seedContext = await chromium.launch({ headless: true }).then(b => b.newContext({ storageState: SESSION_FILE }));
        const storageState = await seedContext.storageState();
        await seedContext.browser()?.close();

        // Seed files for playwright persistent profile isn't straightforward with `storageState`. 
        // We will pass it via `launchPersistentContext` initialization if Playwright supports it, otherwise load in page.
        // Actually, launchPersistentContext doesn't accept storageState directly in the same way.
        // Let's pass it by creating a temporary browser, loading state, and copying cookies manually.
        const launchedContext = await chromium.launchPersistentContext(profilePath, persistentOptions);
        await launchedContext.addCookies(storageState.cookies);
        context = launchedContext;
      } else {
        context = await chromium.launchPersistentContext(profilePath, persistentOptions);
      }
    } else {
      context = await browser!.newContext(buildContextOptions(browser!, index, hasSession));
    }

    // Smart distribution: assign unique sites to each agent instead of overlapping
    let targetSite: string | null = null;
    if (targetSites.length > 0) {
      // Each agent gets a unique site; extras get null (take whatever is available)
      if (index < targetSites.length) {
        targetSite = targetSites[index] ?? null;
      }
    }
    const staggerStartupMs = agentId * 200;

    const promise = sleep(staggerStartupMs).then(() => runAgent(agentId, context, targetSite));
    agentPromises.push(promise);
  }

  await Promise.all(agentPromises);
  if (browser) {
    await browser.close();
  }

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

async function runSequentialCapture(targetSites: string[]) {
  runState.winningAgentId = null;
  runState.isClosed = false;
  runState.holds = [];
  runState.heldSites.clear();

  const hasSession = fs.existsSync(SESSION_FILE);
  if (!hasSession) {
    console.warn('WARNING: session.json not found. Capture will run as guest.');
  } else {
    console.log('Authentication session loaded.');
  }

  if (DRY_RUN) {
    console.log('Dry-run capture is enabled. Will stop on site details.');
  }

  console.log(`Sequential mode: booking up to ${MAX_HOLDS} site(s) one at a time.`);

  const contextOptions: Parameters<typeof chromium.launch>[0] = { headless: !IS_HEADED };
  const browser = await chromium.launch(contextOptions);
  const context = hasSession
    ? await browser.newContext({ storageState: SESSION_FILE, timezoneId: 'America/Denver' })
    : await browser.newContext({ timezoneId: 'America/Denver' });
  const page = await context.newPage();
  const label = '[Sequential] ';

  try {
    for (let i = 0; i < targetSites.length; i++) {
      if (runState.holds.length >= MAX_HOLDS) {
        console.log(`${label}Max holds (${MAX_HOLDS}) reached. Done.`);
        break;
      }

      const site = targetSites[i]!;
      if (isSiteAlreadyHeld(site)) {
        continue;
      }

      console.log(`${label}Attempting site ${site} (${i + 1}/${targetSites.length})...`);
      await primeSearchForm(page, label);
      await submitSearchForm(page);
      await waitForSearchResults(page);

      const selection = await openTargetSite(page, site, label);
      if (!selection) {
        console.log(`${label}Could not open ${site}. Trying next.`);
        continue;
      }

      if (isSiteAlreadyHeld(selection.site)) {
        continue;
      }

      console.log(`${label}Opened site ${selection.site}.`);

      if (!AUTO_BOOK || DRY_RUN) {
        if (SCREENSHOT_ON_WIN) {
          await page.screenshot({ path: `logs/seq-${selection.site}-${Date.now()}.png` }).catch(() => { });
        }
        await claimSuccess(0, selection.site, 'site-details');
        continue;
      }

      const booked = await continueToOrderDetails(page);
      if (booked) {
        if (SCREENSHOT_ON_WIN) {
          await page.screenshot({ path: `logs/seq-${selection.site}-${Date.now()}.png` }).catch(() => { });
        }
        await claimSuccess(0, selection.site, 'order-details');
        console.log(`${label}Held ${selection.site} at Order Details.`);
      } else {
        console.log(`${label}Could not reach Order Details for ${selection.site}.`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    console.error(`${label}${message}`);
  }

  if (IS_HEADED && runState.holds.length > 0 && AUTO_BOOK && !DRY_RUN) {
    console.log(`${label}Browser will stay open until you close it. Proceed to checkout manually.`);
    await page.waitForEvent('close').catch(() => { });
  }

  await browser.close().catch(() => { });

  writeRunSummary({
    timestamp: new Date().toISOString(),
    targetDate: TARGET_DATE,
    loop: LOOP,
    agentCount: 1,
    bookingMode: BOOKING_MODE,
    maxHolds: MAX_HOLDS,
    holds: runState.holds,
    winningAgent: runState.winningAgentId,
    winningSite: runState.holds[0]?.site ?? null,
    status: runState.holds.length > 0 ? 'success' : 'failure',
  });
}

async function startRace() {
  console.log('\nBear Lake Booker Hybrid Capture');

  if (TARGET_TIME) {
    console.log('Scheduled fire mode enabled. Skipping HTTP preflight and waiting for target time.');
    await launchCapture([]);
    return;
  }

  const exactMatches = await waitForAvailability();
  if (exactMatches.length === 0) {
    return;
  }

  let targetSites = exactMatches.map((site) => site.site);

  // Apply allowlist filter if --sites was specified
  if (SITE_ALLOWLIST.length > 0) {
    targetSites = targetSites.filter(site => SITE_ALLOWLIST.includes(site.toUpperCase()));
    if (targetSites.length === 0) {
      console.log(`None of the requested sites (${SITE_ALLOWLIST.join(', ')}) are available.`);
      return;
    }
    console.log(`Filtered to requested sites: ${targetSites.join(', ')}`);
  }

  console.log(`Exact-date opening detected for ${TARGET_DATE}: ${targetSites.join(', ')}`);

  if (SEQUENTIAL) {
    await runSequentialCapture(targetSites);
  } else {
    console.log('Launching Playwright capture agents.');
    await launchCapture(targetSites);
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

void startRace().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
