import { type BrowserContext, type Page } from 'playwright';
import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());
import { parseArgs } from 'util';
import * as fs from 'fs';
import { searchAvailability, type SiteAvailability } from './reserveamerica';
import { USER_AGENTS } from './config';
import { notifySuccess, type SuccessStage } from './notify';
import { type AgentRunSummary, writeRunSummary } from './reporter';
import { CAPTURE_EXIT_CODES, type CaptureResultArtifact, captureOutcomeToExitCode, type CaptureOutcome } from './flow-contract';
import { getAccountDisplayName, getAccountStorageKey, getReadableSessionPath, normalizeAccount, sessionExists } from './session-utils';
import { executeLaunchStrategy, parseLaunchMode } from './launch-strategy';
import { ensureActiveSession } from './session-manager';
import {
  sleep,
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
    accounts: { type: 'string' },
    launchMode: { type: 'string', default: 'preload' },
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
  --accounts <csv>              Capture into multiple authenticated accounts
  --launchMode <mode>           preload, refresh, or fresh-page [default: preload]
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
const LAUNCH_MODE = parseLaunchMode(values.launchMode);
const RUN_STARTED_AT = Date.now();
const REQUESTED_ACCOUNTS = typeof values.accounts === 'string'
  ? Array.from(new Set(
      values.accounts
        .split(',')
        .map((account) => normalizeAccount(account))
        .filter((account): account is string => Boolean(account)),
    ))
  : [];

type HoldRecord = {
  account: string;
  agentId: number;
  site: string;
  stage: SuccessStage;
  timestamp: string;
};

type CaptureAccount = {
  account: string | undefined;
  displayName: string;
  storageKey: string;
};

type AccountRunState = {
  account: CaptureAccount;
  holds: HoldRecord[];
  isClosed: boolean;
  winningAgentId: number | null;
  maxHolds: number;
};

type AgentContextRecord = {
  accountKey: string;
  context: BrowserContext;
};

type AgentSpec = {
  agentId: number;
  account: CaptureAccount;
  preferredSite: string | null;
  localAgentIndex: number;
};

const configuredAccounts: CaptureAccount[] = REQUESTED_ACCOUNTS.length > 0
  ? REQUESTED_ACCOUNTS.map((account) => ({
      account,
      displayName: getAccountDisplayName(account),
      storageKey: getAccountStorageKey(account),
    }))
  : [{
      account: undefined,
      displayName: getAccountDisplayName(undefined),
      storageKey: getAccountStorageKey(undefined),
    }];

const globalHeldSites = new Set<string>();
const accountRunStates = new Map<string, AccountRunState>(
  configuredAccounts.map((account) => [
    account.storageKey,
    {
      account,
      holds: [],
      isClosed: false,
      winningAgentId: null,
      maxHolds: BOOKING_MODE === 'multi' ? MAX_HOLDS : 1,
    },
  ]),
);
const activeContexts = new Map<number, AgentContextRecord>();
const agentRunSummaries = new Map<number, AgentRunSummary>();
const availabilityTelemetry: {
  startedAt?: string;
  finishedAt?: string;
  matchedSites: string[];
  allowlistApplied: boolean;
} = {
  matchedSites: [],
  allowlistApplied: SITE_ALLOWLIST.length > 0,
};
const sessionPreflightTelemetry: Array<{
  account: string;
  result: string;
  checkedAt: string;
}> = [];
let requestedSitesForRun: string[] = [];
let readyAccountsForRun: CaptureAccount[] = [];
let allocatedAgentCountForRun = 0;

function buildCaptureResultArtifact(outcome: CaptureOutcome): CaptureResultArtifact {
  return {
    outcome,
    accountsWithHolds: Array.from(accountRunStates.values())
      .filter((state) => state.holds.length > 0 && state.account.account)
      .map((state) => state.account.account!),
    usedDefaultAccount: Array.from(accountRunStates.values()).some(
      (state) => !state.account.account && state.holds.length > 0,
    ),
  };
}

function writeCaptureResultArtifact(outcome: CaptureOutcome): void {
  const artifactPath = process.env.CAPTURE_RESULT_PATH;
  if (!artifactPath) {
    return;
  }

  try {
    fs.writeFileSync(artifactPath, JSON.stringify(buildCaptureResultArtifact(outcome), null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to write capture result artifact: ${error}`);
  }
}

function createAgentRunSummary(agentId: number, account: CaptureAccount, preferredSite: string | null): AgentRunSummary {
  const summary: AgentRunSummary = {
    account: account.displayName,
    agentId,
    preferredSite,
    outcome: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
    durationMs: undefined,
    launch: null,
    candidateSites: [],
    attemptedSites: [],
    heldSite: null,
    error: undefined,
    artifacts: {
      successScreenshotPath: undefined,
      failureScreenshotPaths: [],
    },
  };
  agentRunSummaries.set(agentId, summary);
  return summary;
}

function finishAgentRun(summary: AgentRunSummary, outcome: AgentRunSummary['outcome'], error?: string): void {
  if (summary.finishedAt) {
    return;
  }

  const finishedAt = Date.now();
  summary.outcome = outcome;
  summary.finishedAt = new Date(finishedAt).toISOString();
  summary.durationMs = finishedAt - new Date(summary.startedAt).getTime();
  if (error) {
    summary.error = error;
  }
}

function getAllHolds(): HoldRecord[] {
  return Array.from(accountRunStates.values())
    .flatMap((state) => state.holds)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function isSiteAlreadyHeld(siteId: string): boolean {
  return globalHeldSites.has(siteId);
}

function shouldStopAgent(agentId: number, accountKey: string): boolean {
  const accountState = accountRunStates.get(accountKey);
  if (!accountState) {
    return false;
  }
  if (accountState.isClosed) {
    return accountState.winningAgentId !== agentId;
  }
  return false;
}

function registerHold(agentId: number, account: CaptureAccount, siteId: string, stage: SuccessStage): boolean {
  const accountState = accountRunStates.get(account.storageKey);
  if (!accountState || accountState.isClosed) return false;
  if (globalHeldSites.has(siteId)) return false;

  globalHeldSites.add(siteId);
  accountState.holds.push({
    account: account.displayName,
    agentId,
    site: siteId,
    stage,
    timestamp: new Date().toISOString(),
  });

  notifySuccess(siteId, agentId, stage, TARGET_DATE, LOOP);
  return true;
}

async function claimSuccess(agentId: number, account: CaptureAccount, siteId: string, stage: SuccessStage): Promise<boolean> {
  const accountState = accountRunStates.get(account.storageKey);
  if (!accountState) {
    return false;
  }

  const registered = registerHold(agentId, account, siteId, stage);
  if (!registered) return false;

  if (accountState.holds.length >= accountState.maxHolds) {
    console.log(`[${account.displayName}] Max holds reached. Closing agents for this account.`);
    accountState.isClosed = true;
    accountState.winningAgentId = agentId;
    await cancelRemainingAgents(account.storageKey, agentId);
  }
  return true;
}

async function cancelRemainingAgents(accountKey: string, excludeAgentId: number) {
  for (const [agentId, record] of activeContexts.entries()) {
    if (record.accountKey === accountKey && agentId !== excludeAgentId) {
      await record.context.close().catch(() => {});
    }
  }
}

function allocateAgents(accounts: CaptureAccount[], totalConcurrency: number, targetSites: string[]): AgentSpec[] {
  const totalAgents = Math.max(totalConcurrency, accounts.length);
  const localCounts = new Map<string, number>();
  const specs: AgentSpec[] = [];

  for (let i = 0; i < totalAgents; i++) {
    const account = accounts[i % accounts.length];
    if (!account) {
      continue;
    }
    const currentCount = localCounts.get(account.storageKey) ?? 0;
    const localAgentIndex = currentCount + 1;
    localCounts.set(account.storageKey, localAgentIndex);

    specs.push({
      agentId: i + 1,
      account,
      preferredSite: targetSites[i] ?? null,
      localAgentIndex,
    });
  }

  return specs;
}

async function waitForAvailability(): Promise<SiteAvailability[]> {
  availabilityTelemetry.startedAt = new Date().toISOString();
  for (;;) {
    const result = await searchAvailability({
      date: TARGET_DATE,
      length: STAY_LENGTH,
      loop: LOOP,
    });

    if (result.exactDateMatches.length > 0) {
      availabilityTelemetry.finishedAt = new Date().toISOString();
      availabilityTelemetry.matchedSites = result.exactDateMatches.map((match) => match.site);
      return result.exactDateMatches;
    }

    const timestamp = new Date().toLocaleTimeString();
    if (!MONITOR_INTERVAL_MINS) {
      console.log(`[${timestamp}] No exact-date availability detected. Skipping browser launch.`);
      availabilityTelemetry.finishedAt = new Date().toISOString();
      return [];
    }

    console.log(
      `[${timestamp}] No exact-date availability for ${TARGET_DATE}. Retrying in ${MONITOR_INTERVAL_MINS} minute(s).`,
    );
    await sleep(MONITOR_INTERVAL_MINS * 60_000);
  }
}

async function runAgent(spec: AgentSpec, context: BrowserContext) {
  const { agentId, account, preferredSite, localAgentIndex } = spec;
  activeContexts.set(agentId, { accountKey: account.storageKey, context });
  let page = await context.newPage();
  const agentSummary = createAgentRunSummary(agentId, account, preferredSite);
  try {
    const label = `[${account.displayName}][Agent ${localAgentIndex}] `;
    const launchResult = await executeLaunchStrategy({
      context,
      page,
      loop: LOOP,
      targetDate: TARGET_DATE,
      stayLength: STAY_LENGTH,
      targetTime: TARGET_TIME ?? undefined,
      launchMode: LAUNCH_MODE,
      agentLabel: label,
    });
    page = launchResult.page;
    agentSummary.launch = launchResult.telemetry;

    const candidates = await resolveTargetSites(page, TARGET_DATE, STAY_LENGTH);
    agentSummary.candidateSites = candidates.map((candidate) => candidate.site);
    if (preferredSite) candidates.sort((a) => (a.site === preferredSite ? -1 : 1));

    if (candidates.length === 0) {
      finishAgentRun(agentSummary, 'no-candidates');
      return;
    }

    for (const selection of candidates) {
      if (shouldStopAgent(agentId, account.storageKey)) {
        finishAgentRun(agentSummary, 'stopped');
        break;
      }
      if (isSiteAlreadyHeld(selection.site)) continue;
      agentSummary.attemptedSites.push(selection.site);

      if (await openSiteDetails(page, selection)) {
        if (isSiteAlreadyHeld(selection.site)) continue;

        if (!AUTO_BOOK || DRY_RUN) {
          await claimSuccess(agentId, account, selection.site, 'site-details');
          agentSummary.heldSite = selection.site;
          finishAgentRun(agentSummary, 'site-details-held');
          if (SCREENSHOT_ON_WIN) {
            const screenshotPath = `logs/agent-${agentId}-win-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath }).catch(() => {});
            agentSummary.artifacts.successScreenshotPath = screenshotPath;
          }
          if (IS_HEADED) await page.waitForEvent('close').catch(() => {});
          return;
        }

        if (await continueToOrderDetails(page, TARGET_DATE, STAY_LENGTH)) {
          console.log(`${label}Reached Order Details for ${selection.site}. Finalizing hold...`);

          if (await addToCart(page, label, account.account, IS_HEADED)) {
            await claimSuccess(agentId, account, selection.site, 'order-details');
            const screenshotPath = `logs/cart-agent-${agentId}-${selection.site}-${Date.now()}.png`;
            await page.screenshot({ path: screenshotPath }).catch(() => {});
            console.log(`${label}✅ Final hold secured in Shopping Cart! Screenshot: ${screenshotPath}`);
            agentSummary.heldSite = selection.site;
            agentSummary.artifacts.successScreenshotPath = screenshotPath;
            finishAgentRun(agentSummary, 'order-details-held');

            if (IS_HEADED) await page.waitForEvent('close').catch(() => {});
            return;
          } else {
            const errorPath = `logs/fail-cart-agent-${agentId}-${selection.site}-${Date.now()}.png`;
            await page.screenshot({ path: errorPath }).catch(() => {});
            console.log(`${label}Failed to move to Shopping Cart. Screenshot: ${errorPath}`);
            agentSummary.artifacts.failureScreenshotPaths.push(errorPath);
            agentSummary.outcome = 'cart-failed';
          }
        }
      }
    }
    if (!agentSummary.finishedAt) {
      finishAgentRun(agentSummary, 'exhausted');
    }
  } catch (error) {
    console.error(`[Agent ${agentId}] Error: ${error}`);
    finishAgentRun(agentSummary, 'error', error instanceof Error ? error.message : String(error));
  } finally {
    activeContexts.delete(agentId);
    await context.close().catch(() => {});
  }
}
async function launchCapture(targetSites: string[]): Promise<CaptureOutcome> {
  // 1. Ensure we have a valid session before starting any agents
  readyAccountsForRun = [];
  for (const account of configuredAccounts) {
    const sessionResult = await ensureActiveSession(account.account, {
      logPrefix: `[Pre-Flight][${account.displayName}] `,
    });
    sessionPreflightTelemetry.push({
      account: account.displayName,
      result: sessionResult,
      checkedAt: new Date().toISOString(),
    });
    if (sessionResult !== 'failed') {
      readyAccountsForRun.push(account);
    }
  }

  if (readyAccountsForRun.length === 0) {
    console.error('Pre-flight validation failed. Cannot proceed with capture.');
    return 'auth-failed';
  }

  if (PROFILE_MODE === 'persistent' && !fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  let browser: any = null;
  if (PROFILE_MODE !== 'persistent') {
    browser = await chromium.launch({ headless: !IS_HEADED });
  }

  const agentSpecs = allocateAgents(readyAccountsForRun, CONCURRENCY, targetSites);
  allocatedAgentCountForRun = agentSpecs.length;
  const promises: Promise<void>[] = [];
  for (const [i, spec] of agentSpecs.entries()) {
    const { agentId, account, localAgentIndex } = spec;
    let context: BrowserContext;
    const sessionPath = getReadableSessionPath(account.account);
    const hasSession = sessionExists(account.account);

    if (PROFILE_MODE === 'persistent') {
      const path = `${PROFILE_DIR}/${account.storageKey}/agent-${localAgentIndex}`;
      const options = { headless: !IS_HEADED, timezoneId: 'America/Denver' };
      context = await chromium.launchPersistentContext(path, options);
      if (hasSession) {
        console.log(`[${account.displayName}][Agent ${localAgentIndex}] Refreshing session state...`);
        await injectSession(context, account.account);
      }
    } else {
      context = await browser!.newContext({
        storageState: hasSession ? sessionPath : undefined,
        timezoneId: 'America/Denver',
      });
    }
    promises.push(sleep(i * 300).then(() => runAgent(spec, context)));
  }

  await Promise.all(promises);
  if (browser) await browser.close();
  return getAllHolds().length > 0 ? 'success' : 'no-availability';
}

async function startRace(): Promise<CaptureOutcome> {
  console.log('--- Bear Lake Sniper Mode ---');
  requestedSitesForRun = [];
  if (TARGET_TIME) {
    return launchCapture([]);
  }

  const result = await waitForAvailability();
  if (result.length === 0) {
    return 'no-availability';
  }

  let targetSites = result.map((s) => s.site);
  if (SITE_ALLOWLIST.length > 0) {
    targetSites = targetSites.filter((s) => SITE_ALLOWLIST.includes(s.toUpperCase()));
    if (targetSites.length === 0) {
      console.log('No available sites match your --sites allowlist.');
      return 'no-availability';
    }
  }
  requestedSitesForRun = targetSites;
  return launchCapture(targetSites);
}

startRace()
  .then((outcome) => {
    const runFinishedAt = Date.now();
    const holds = getAllHolds();
    const winningHold = holds[0] ?? null;
    writeRunSummary({
      timestamp: new Date(runFinishedAt).toISOString(),
      runStartedAt: new Date(RUN_STARTED_AT).toISOString(),
      runFinishedAt: new Date(runFinishedAt).toISOString(),
      durationMs: runFinishedAt - RUN_STARTED_AT,
      targetDate: TARGET_DATE,
      loop: LOOP,
      targetTime: TARGET_TIME ?? undefined,
      monitorIntervalMins: MONITOR_INTERVAL_MINS,
      launchMode: LAUNCH_MODE,
      autoBook: AUTO_BOOK,
      dryRun: DRY_RUN,
      headed: IS_HEADED,
      profileMode: PROFILE_MODE,
      accountsConfigured: configuredAccounts.map((account) => account.displayName),
      accountsReady: readyAccountsForRun.map((account) => account.displayName),
      accountsWithHolds: Array.from(accountRunStates.values())
        .filter((state) => state.holds.length > 0)
        .map((state) => state.account.displayName),
      agentCount: allocatedAgentCountForRun,
      bookingMode: BOOKING_MODE,
      maxHolds: MAX_HOLDS,
      requestedSites: requestedSitesForRun,
      availableSites: availabilityTelemetry.matchedSites,
      holds,
      winningAgent: winningHold?.agentId ?? null,
      winningSite: winningHold?.site ?? null,
      status: outcome === 'success' ? 'success' : outcome,
      sessionPreflight: sessionPreflightTelemetry,
      availabilityCheck: availabilityTelemetry.startedAt && availabilityTelemetry.finishedAt
        ? {
            startedAt: availabilityTelemetry.startedAt,
            finishedAt: availabilityTelemetry.finishedAt,
            matchedSites: availabilityTelemetry.matchedSites,
            allowlistApplied: availabilityTelemetry.allowlistApplied,
          }
        : undefined,
      agents: Array.from(agentRunSummaries.values()).sort((a, b) => a.agentId - b.agentId),
    });
    writeCaptureResultArtifact(outcome);
    process.exitCode = captureOutcomeToExitCode(outcome);
    if (outcome === 'no-availability') {
      console.log('Capture ended without any qualifying holds.');
    } else if (outcome === 'auth-failed') {
      console.error('Capture stopped because session validation/manual login did not complete.');
    }
  })
  .catch((error) => {
    console.error(error);
    const runFinishedAt = Date.now();
    const holds = getAllHolds();
    const winningHold = holds[0] ?? null;
    writeRunSummary({
      timestamp: new Date(runFinishedAt).toISOString(),
      runStartedAt: new Date(RUN_STARTED_AT).toISOString(),
      runFinishedAt: new Date(runFinishedAt).toISOString(),
      durationMs: runFinishedAt - RUN_STARTED_AT,
      targetDate: TARGET_DATE,
      loop: LOOP,
      targetTime: TARGET_TIME ?? undefined,
      monitorIntervalMins: MONITOR_INTERVAL_MINS,
      launchMode: LAUNCH_MODE,
      autoBook: AUTO_BOOK,
      dryRun: DRY_RUN,
      headed: IS_HEADED,
      profileMode: PROFILE_MODE,
      accountsConfigured: configuredAccounts.map((account) => account.displayName),
      accountsReady: readyAccountsForRun.map((account) => account.displayName),
      accountsWithHolds: Array.from(accountRunStates.values())
        .filter((state) => state.holds.length > 0)
        .map((state) => state.account.displayName),
      agentCount: allocatedAgentCountForRun,
      bookingMode: BOOKING_MODE,
      maxHolds: MAX_HOLDS,
      requestedSites: requestedSitesForRun,
      availableSites: availabilityTelemetry.matchedSites,
      holds,
      winningAgent: winningHold?.agentId ?? null,
      winningSite: winningHold?.site ?? null,
      status: 'error',
      sessionPreflight: sessionPreflightTelemetry,
      availabilityCheck: availabilityTelemetry.startedAt && availabilityTelemetry.finishedAt
        ? {
            startedAt: availabilityTelemetry.startedAt,
            finishedAt: availabilityTelemetry.finishedAt,
            matchedSites: availabilityTelemetry.matchedSites,
            allowlistApplied: availabilityTelemetry.allowlistApplied,
          }
        : undefined,
      agents: Array.from(agentRunSummaries.values()).sort((a, b) => a.agentId - b.agentId),
    });
    writeCaptureResultArtifact('error');
    process.exitCode = CAPTURE_EXIT_CODES.error;
  });
