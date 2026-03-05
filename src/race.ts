import { chromium, type BrowserContext, type Page } from 'playwright';
import { parseArgs } from 'util';
import { execSync } from 'child_process';
import * as fs from 'fs';
import { PARK_URL, searchAvailability, type SiteAvailability } from './reserveamerica';

const SESSION_FILE = 'session.json';
const RECIPIENT = 'richards_jason@me.com';

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Edge/120.0.0.0',
];

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

let isSuccess = false;
let winningAgentId: number | null = null;

type SuccessStage = 'site-details' | 'order-details';

type SiteSelection = {
  site: string;
  detailsUrl: string;
  actionText: string;
};

const ALLOWED_ROW_ACTIONS = new Set(['SEE DETAILS', 'ENTER DATE']);
const activeContexts = new Map<number, BrowserContext>();

function notifySuccess(siteId: string, agentId: number, stage: SuccessStage) {
  if (isSuccess) {
    return;
  }

  isSuccess = true;

  const stageLabel = stage === 'order-details' ? 'reached Order Details for' : 'opened site details for';
  const message = `Bear Lake Booker: Agent ${agentId} ${stageLabel} site ${siteId} for ${TARGET_DATE} in ${LOOP}.`;

  console.log(`\n[Agent ${agentId}] ${stage === 'order-details' ? 'Order Details reached' : 'Site details opened'} for ${siteId}.`);

  try {
    const escaped = message.replace(/"/g, '\\"');
    execSync(`osascript -e 'display notification "${escaped}" with title "Bear Lake Booker: CAPTURE" sound name "Glass"'`);
  } catch {
    console.warn(`[Agent ${agentId}] Desktop notification failed.`);
  }

  try {
    const escaped = message.replace(/"/g, '\\"');
    execSync(`osascript -e 'tell application "Messages" to send "${escaped}" to buddy "${RECIPIENT}"'`);
    console.log(`[Agent ${agentId}] iMessage sent to ${RECIPIENT}`);
  } catch {
    console.warn(`[Agent ${agentId}] iMessage failed.`);
  }
}

function shouldCancelRemainingAgents(stage: SuccessStage) {
  return stage === 'order-details' && AUTO_BOOK && !DRY_RUN;
}

function shouldStopAgent(agentId: number) {
  return winningAgentId !== null && winningAgentId !== agentId;
}

async function claimSuccess(agentId: number, siteId: string, stage: SuccessStage) {
  if (shouldCancelRemainingAgents(stage)) {
    if (winningAgentId !== null && winningAgentId !== agentId) {
      return false;
    }

    if (winningAgentId === null) {
      winningAgentId = agentId;
    }

    notifySuccess(siteId, agentId, stage);
    await cancelRemainingAgents(agentId);
    return true;
  }

  notifySuccess(siteId, agentId, stage);
  return true;
}

async function cancelRemainingAgents(winnerAgentId: number) {
  const closePromises: Array<Promise<void>> = [];

  for (const [agentId, context] of activeContexts.entries()) {
    if (agentId === winnerAgentId) {
      continue;
    }

    console.log(`[Agent ${agentId}] Cancelling after winner Agent ${winnerAgentId} reached Order Details.`);
    closePromises.push(
      context.close().catch(() => {}),
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

async function runAgent(agentId: number, context: BrowserContext, targetSite: string | null) {
  activeContexts.set(agentId, context);
  const page = await context.newPage();

  try {
    console.log(`[Agent ${agentId}] Priming search form...`);
    await primeSearchForm(page);

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

    const selection = await openTargetSite(page, targetSite);
    if (!selection) {
      console.log(`[Agent ${agentId}] No target site details page could be opened.`);
      return;
    }

    console.log(`[Agent ${agentId}] Opened site ${selection.site} via ${selection.actionText || 'site details'}.`);

    if (!AUTO_BOOK || DRY_RUN) {
      if (DRY_RUN) {
        console.log(`[Agent ${agentId}] Dry run enabled. Stopping on site details for ${selection.site}.`);
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
      await holdBrowserIfNeeded(page, agentId);
    } else {
      console.log(`[Agent ${agentId}] Opened ${selection.site}, but did not reach Order Details.`);
    }
  } catch (error) {
    if (!isSuccess) {
      const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
      console.error(`[Agent ${agentId}] ${message}`);
      await page.screenshot({ path: `agent-${agentId}-error.png` }).catch(() => {});
    }
  } finally {
    activeContexts.delete(agentId);
    await page.close().catch(() => {});
    await context.close().catch(() => {});
  }
}

async function primeSearchForm(page: Page) {
  await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#unifSearchForm');

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

async function openTargetSite(page: Page, preferredSite: string | null): Promise<SiteSelection | null> {
  const selection = await resolveTargetSite(page, preferredSite);
  if (!selection) {
    return null;
  }

  await page.goto(selection.detailsUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () =>
      Boolean(document.querySelector('#booksiteform')) ||
      Boolean(document.querySelector('#arrivaldate')) ||
      (document.body.textContent ?? '').includes('No suitable availability shown'),
    {
      timeout: 15000,
    },
  );

  return selection;
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

  console.log(`[Agent ${agentId}] Keeping browser open for 30 seconds.`);
  await page.waitForTimeout(30_000);
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

async function launchCapture(targetSites: string[]) {
  activeContexts.clear();
  winningAgentId = null;
  isSuccess = false;
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

  const browser = await chromium.launch({ headless: !IS_HEADED });
  const agentPromises: Array<Promise<void>> = [];

  for (let index = 0; index < CONCURRENCY; index += 1) {
    const context = await browser.newContext(buildContextOptions(browser, index, hasSession));
    const targetSite = targetSites.length > 0 ? targetSites[index % targetSites.length] ?? null : null;
    const agentId = index + 1;
    const staggerStartupMs = agentId * 200;

    const promise = sleep(staggerStartupMs).then(() => runAgent(agentId, context, targetSite));
    agentPromises.push(promise);
  }

  await Promise.all(agentPromises);
  await browser.close();
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

  const targetSites = exactMatches.map((site) => site.site);
  console.log(`Exact-date opening detected for ${TARGET_DATE}: ${targetSites.join(', ')}`);
  console.log('Launching Playwright capture agents.');

  await launchCapture(targetSites);
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
