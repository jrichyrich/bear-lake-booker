import { type BrowserContext, type Page } from 'playwright';
import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());
import { parseArgs } from 'util';
import * as fs from 'fs';
import { searchAvailability, type SiteAvailability } from './reserveamerica';
import { loadAvailabilitySnapshot, rankRequestedSitesForCapture } from './availability-snapshots';
import { USER_AGENTS } from './config';
import {
  normalizeNotificationProfile,
  notifyFinalInventorySummary,
  notifySuccess,
  type SuccessStage,
} from './notify';
import { AccountBooker, type CaptureAccount, type HoldRecord } from './account-booker';
import { AccountBookerRuntime } from './account-booker-runtime';
import { type AccountRunSummary, type AgentRunSummary, type RunSummary, writeRunSummary } from './reporter';
import { CAPTURE_EXIT_CODES, type CaptureResultArtifact, captureOutcomeToExitCode, type CaptureOutcome } from './flow-contract';
import { getAccountDisplayName, getAccountStorageKey, getReadableSessionPath, normalizeCliAccounts, sessionExists } from './session-utils';
import { executeLaunchStrategy, parseLaunchMode } from './launch-strategy';
import { ensureActiveSession } from './session-manager';
import {
  assignPreferredSitesToAgents,
  filterTargetSiteIds,
  getInitialTargetSites,
  prioritizeAccountAwareTargetSiteIds,
} from './site-targeting';
import { loadSiteList } from './site-lists';
import {
  inspectCartState,
  sleep,
  resolveTargetSites,
  openSiteDetails,
  injectSession,
  saveSearchResultsDebugArtifacts,
  type SiteSelection,
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
    siteList: { type: 'string' },
    siteListSource: { type: 'string' },
    availabilitySnapshot: { type: 'string' },
    accounts: { type: 'string' },
    notificationProfile: { type: 'string', default: 'test' },
    checkoutAuthMode: { type: 'string' },
    launchMode: { type: 'string', default: 'preload' },
    skipCartPreflight: { type: 'boolean', default: false },
    skipSessionPreflight: { type: 'boolean', default: false },
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
  --siteList <name-or-path>     Ranked site list from camp sites or a path
  --availabilitySnapshot <path> Rank allowed sites using a stored availability snapshot
  --accounts <csv>              Capture into multiple authenticated account emails
  --notificationProfile <name>  test or production [default: test]
  --checkoutAuthMode <mode>     auto or manual [default: manual when headed, else auto]
  --launchMode <mode>           preload, refresh, or fresh-page [default: preload]
  --skipCartPreflight           Skip the initial empty-cart check before launch
  --skipSessionPreflight        Skip the initial session refresh because a wrapper already handled it
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
const NOTIFICATION_PROFILE = normalizeNotificationProfile(values.notificationProfile as string | undefined);
const PROFILE_DIR = values.profileDir!;
const RESET_PROFILES = values.resetProfiles!;
const SCREENSHOT_ON_WIN = values.screenshotOnWin!;
const EXPLICIT_SITE_ALLOWLIST: string[] = values.sites ? values.sites.split(',').map((s) => s.trim().toUpperCase()) : [];
const SITE_LIST_SPEC = typeof values.siteList === 'string' ? values.siteList.trim() : '';
const RESOLVED_SITE_LIST_SOURCE = typeof values.siteListSource === 'string' ? values.siteListSource : undefined;
const loadedSiteList = EXPLICIT_SITE_ALLOWLIST.length === 0 && SITE_LIST_SPEC ? loadSiteList(SITE_LIST_SPEC) : null;
const SITE_ALLOWLIST: string[] = EXPLICIT_SITE_ALLOWLIST.length > 0
  ? EXPLICIT_SITE_ALLOWLIST
  : loadedSiteList?.siteIds ?? [];
const SITE_LIST_SOURCE = loadedSiteList?.sourcePath ?? RESOLVED_SITE_LIST_SOURCE;
const AVAILABILITY_SNAPSHOT_PATH = typeof values.availabilitySnapshot === 'string'
  ? values.availabilitySnapshot
  : undefined;
const AVAILABILITY_SNAPSHOT = AVAILABILITY_SNAPSHOT_PATH
  ? loadAvailabilitySnapshot(AVAILABILITY_SNAPSHOT_PATH)
  : null;
const LAUNCH_MODE = parseLaunchMode(values.launchMode);
const CHECKOUT_AUTH_MODE: 'auto' | 'manual' = values.checkoutAuthMode === 'auto'
  ? 'auto'
  : values.checkoutAuthMode === 'manual'
    ? 'manual'
    : IS_HEADED
      ? 'manual'
      : 'auto';
const SKIP_CART_PREFLIGHT = values.skipCartPreflight === true;
const SKIP_SESSION_PREFLIGHT = values.skipSessionPreflight === true;
const RUN_STARTED_AT = Date.now();
const REQUESTED_ACCOUNTS = typeof values.accounts === 'string'
  ? Array.from(new Set(
      normalizeCliAccounts(values.accounts.split(','), '[Race] '),
    ))
  : [];

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
const accountBookers = new Map<string, AccountBooker>(
  configuredAccounts.map((account) => [
    account.storageKey,
    new AccountBooker(account, BOOKING_MODE === 'multi' ? MAX_HOLDS : 1),
  ]),
);
const accountBookerRuntimes = new Map<string, AccountBookerRuntime>();
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
const cartPreflightTelemetry: Array<{
  account: string;
  result: string;
  siteIds: string[];
  checkedAt: string;
  error: string | undefined;
}> = [];
let requestedSitesForRun: string[] = [];
let readyAccountsForRun: CaptureAccount[] = [];
let allocatedAgentCountForRun = 0;
const searchResultsDebugDumpedAccounts = new Set<string>();

function buildCaptureResultArtifact(outcome: CaptureOutcome): CaptureResultArtifact {
  return {
    outcome,
    accountsWithHolds: Array.from(accountBookers.values())
      .filter((booker) => booker.holds.length > 0 && booker.account.account)
      .map((booker) => booker.account.account!),
    usedDefaultAccount: Array.from(accountBookers.values()).some(
      (booker) => !booker.account.account && booker.holds.length > 0,
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
    cartSitesBefore: undefined,
    cartSitesAfter: undefined,
    cartConfirmationSource: null,
    finalAttemptUrl: undefined,
    clickedCartSelectors: [],
    checkoutAuthEncountered: false,
    cartVerificationError: undefined,
    skippedSites: [],
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

function buildSnapshotFallbackSelections(targetSites: string[]): SiteSelection[] {
  if (!AVAILABILITY_SNAPSHOT || targetSites.length === 0) {
    return [];
  }

  const targetSiteIds = new Set(targetSites.map((site) => site.trim().toUpperCase()).filter(Boolean));
  return AVAILABILITY_SNAPSHOT.results
    .filter((result) => result.loop.trim().toUpperCase() === LOOP.trim().toUpperCase())
    .filter((result) => targetSiteIds.has(result.site.trim().toUpperCase()))
    .filter((result) => Boolean(result.detailsUrl))
    .map((result) => {
      const detailsUrl = new URL(result.detailsUrl);
      detailsUrl.searchParams.set('arvdate', TARGET_DATE);
      detailsUrl.searchParams.set('lengthOfStay', STAY_LENGTH);
      return {
        site: result.site.trim().toUpperCase(),
        detailsUrl: detailsUrl.toString(),
        actionText: 'SNAPSHOT FALLBACK',
      } satisfies SiteSelection;
    });
}

function mergeSiteSelections(primary: SiteSelection[], secondary: SiteSelection[]): SiteSelection[] {
  const merged = new Map<string, SiteSelection>();
  for (const selection of primary) {
    merged.set(selection.site.trim().toUpperCase(), selection);
  }
  for (const selection of secondary) {
    const normalizedSite = selection.site.trim().toUpperCase();
    if (!merged.has(normalizedSite)) {
      merged.set(normalizedSite, selection);
    }
  }
  return Array.from(merged.values());
}

function isClosedContextError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('target page, context or browser has been closed')
    || normalized.includes('target closed')
    || normalized.includes('page has been closed');
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
  return Array.from(accountBookers.values())
    .flatMap((booker) => booker.holds)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function isSiteAlreadyHeld(siteId: string): boolean {
  return globalHeldSites.has(siteId.toUpperCase());
}

function hasFailedBookingSite(accountKey: string, siteId: string): boolean {
  return accountBookers.get(accountKey)?.hasFailedSite(siteId) ?? false;
}

function getOtherAccountPendingSites(accountKey: string): string[] {
  return Array.from(accountBookers.entries())
    .filter(([otherAccountKey]) => otherAccountKey !== accountKey)
    .flatMap(([, booker]) => booker.getPendingAssignedSites());
}

function buildAccountRunSummaries(): AccountRunSummary[] {
  return Array.from(accountBookers.values()).map((booker) => ({
    account: booker.account.displayName,
    maxHolds: booker.maxHolds,
    holds: booker.holds.map((hold) => hold.site),
    holdDetails: booker.holds,
    assignedSites: Array.from(booker.assignedSites),
    attemptedSites: Array.from(booker.attemptedSites),
    failedSites: Array.from(booker.failedBookingSites),
    verifiedCartSites: Array.from(booker.verifiedCartSites),
    verifiedCartCount: booker.verifiedCartSites.size,
    stopReason: booker.stopReason,
    skippedSites: booker.skipEvents,
  }));
}

function reserveAccountBookingSite(accountKey: string, siteId: string): boolean {
  return accountBookers.get(accountKey)?.reserveSite(siteId) ?? false;
}

function releaseAccountBookingSite(accountKey: string, siteId: string): void {
  accountBookers.get(accountKey)?.releaseSite(siteId);
}

function shouldStopAgent(agentId: number, accountKey: string): boolean {
  const booker = accountBookers.get(accountKey);
  return booker ? !booker.canAgentContinue(agentId) : false;
}

function registerHold(
  agentId: number,
  account: CaptureAccount,
  siteId: string,
  stage: SuccessStage,
  detailsUrl?: string,
): boolean {
  const normalizedSite = siteId.toUpperCase();
  const booker = accountBookers.get(account.storageKey);
  if (!booker || booker.isClosed) return false;
  if (globalHeldSites.has(normalizedSite)) return false;

  const { registered } = booker.recordSuccess(agentId, siteId, stage, detailsUrl);
  if (!registered) return false;

  globalHeldSites.add(normalizedSite);
  notifySuccess(siteId, agentId, stage, TARGET_DATE, LOOP);
  return true;
}

async function claimSuccess(
  agentId: number,
  account: CaptureAccount,
  siteId: string,
  stage: SuccessStage,
  detailsUrl?: string,
): Promise<boolean> {
  const booker = accountBookers.get(account.storageKey);
  if (!booker) {
    return false;
  }

  const registered = registerHold(agentId, account, siteId, stage, detailsUrl);
  if (!registered) return false;

  if (booker.isClosed && booker.holds.length >= booker.maxHolds) {
    console.log(`[${account.displayName}] Max holds reached. Closing agents for this account.`);
    await cancelRemainingAgents(account.storageKey, agentId);
  }
  return true;
}

async function registerCartFailure(agentId: number, account: CaptureAccount, siteId: string): Promise<void> {
  const booker = accountBookers.get(account.storageKey);
  if (!booker) {
    return;
  }

  const shouldClose = booker.recordCartFailure(agentId, siteId);
  if (shouldClose) {
    console.log(
      `[${account.displayName}] Stopping additional hold attempts after ${booker.consecutiveCartFailures} consecutive cart failures with ${booker.holds.length} hold(s) already secured.`,
    );
    await cancelRemainingAgents(account.storageKey, -1);
  }
}

async function reconcileVerifiedCartState(account: CaptureAccount): Promise<void> {
  const booker = accountBookers.get(account.storageKey);
  if (!booker) {
    return;
  }

  const runtime = accountBookerRuntimes.get(account.storageKey);
  if (!runtime) {
    return;
  }

  const verifiedSites = Array.from(booker.verifiedCartSites);
  const { shouldClose } = booker.recordVerifiedCartSites(verifiedSites);
  if (shouldClose) {
    console.log(`[${account.displayName}] Verified cart already holds ${booker.verifiedCartSites.size} site(s). Closing remaining agents for this account.`);
    await cancelRemainingAgents(account.storageKey, -1);
  }
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
      preferredSite: null,
      localAgentIndex,
    });
  }

  const assignedPreferredSites = assignPreferredSitesToAgents(
    targetSites,
    specs.map((spec) => ({
      accountKey: spec.account.storageKey,
      localAgentIndex: spec.localAgentIndex,
    })),
  );

  for (const [index, spec] of specs.entries()) {
    spec.preferredSite = assignedPreferredSites[index] ?? null;
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
  let fallbackSearchContext: BrowserContext | null = null;
  const agentSummary = createAgentRunSummary(agentId, account, preferredSite);
  try {
    const label = `[${account.displayName}][Agent ${localAgentIndex}] `;
    try {
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
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetryWithGuestSearch = message.includes('Loop "') || message.includes('Search form did not fully initialize');
      const browser = context.browser();
      if (!shouldRetryWithGuestSearch || !browser) {
        throw error;
      }

      console.warn(`${label}Authenticated search page failed (${message}). Retrying candidate discovery in a guest context...`);
      fallbackSearchContext = await browser.newContext({ timezoneId: 'America/Denver' });
      const fallbackPage = await fallbackSearchContext.newPage();
      const launchResult = await executeLaunchStrategy({
        context: fallbackSearchContext,
        page: fallbackPage,
        loop: LOOP,
        targetDate: TARGET_DATE,
        stayLength: STAY_LENGTH,
        targetTime: TARGET_TIME ?? undefined,
        launchMode: LAUNCH_MODE,
        agentLabel: `${label}[Guest Search] `,
      });
      page = launchResult.page;
      agentSummary.launch = launchResult.telemetry;
    }

    const liveCandidates = (await resolveTargetSites(page, TARGET_DATE, STAY_LENGTH, LOOP)).filter(
      (candidate) => SITE_ALLOWLIST.length === 0 || SITE_ALLOWLIST.includes(candidate.site.toUpperCase()),
    );
    const snapshotCandidates = buildSnapshotFallbackSelections(SITE_ALLOWLIST);
    const candidates = mergeSiteSelections(liveCandidates, snapshotCandidates);
    agentSummary.candidateSites = candidates.map((candidate) => candidate.site);

    if (candidates.length === 0) {
      if (!searchResultsDebugDumpedAccounts.has(account.storageKey)) {
        searchResultsDebugDumpedAccounts.add(account.storageKey);
        await saveSearchResultsDebugArtifacts(page, `debug-search-results-${account.storageKey}`, label);
      }
      finishAgentRun(agentSummary, 'no-candidates');
      return;
    }

    const candidateBySite = new Map(
      candidates.map((candidate) => [candidate.site.toUpperCase(), candidate]),
    );
    const processedSites = new Set<string>();

    while (processedSites.size < candidates.length) {
      const booker = accountBookers.get(account.storageKey);
      const runtime = accountBookerRuntimes.get(account.storageKey);
      if (!booker || !runtime) {
        break;
      }

      const remainingSiteIds = candidates
        .map((candidate) => candidate.site.toUpperCase())
        .filter((siteId) => !processedSites.has(siteId));
      const orderedCandidateIds = prioritizeAccountAwareTargetSiteIds(remainingSiteIds, {
        preferredSite,
        rotationOffset: localAgentIndex - 1,
        accountAssignedSites: Array.from(booker.assignedSites),
        accountAttemptedSites: Array.from(booker.attemptedSites),
        accountFailedSites: Array.from(booker.failedBookingSites),
        accountReservedSites: Array.from(booker.bookingSitesInFlight),
        otherAccountPendingSites: getOtherAccountPendingSites(account.storageKey),
      });
      const nextSiteId = orderedCandidateIds[0];
      if (!nextSiteId) {
        break;
      }

      processedSites.add(nextSiteId.toUpperCase());
      const selection = candidateBySite.get(nextSiteId.toUpperCase());
      if (!selection) {
        continue;
      }

      if (!agentSummary.preferredSite || !agentSummary.candidateSites.includes(agentSummary.preferredSite)) {
        agentSummary.preferredSite = selection.site;
      }

      if (shouldStopAgent(agentId, account.storageKey)) {
        booker.recordSkip(selection.site, 'account-at-cap', agentId);
        agentSummary.skippedSites.push({ site: selection.site, reason: 'account-at-cap' });
        finishAgentRun(agentSummary, 'stopped');
        break;
      }
      if (isSiteAlreadyHeld(selection.site)) {
        booker.recordSkip(selection.site, 'already-held', agentId);
        agentSummary.skippedSites.push({ site: selection.site, reason: 'already-held' });
        continue;
      }
      if (hasFailedBookingSite(account.storageKey, selection.site)) {
        console.log(`${label}Skipping ${selection.site}; ${account.displayName} already failed to move it into cart.`);
        booker.recordSkip(selection.site, 'already-failed-for-account', agentId);
        agentSummary.skippedSites.push({ site: selection.site, reason: 'already-failed-for-account' });
        continue;
      }

      booker.markAssignedSite(selection.site);
      booker.markAttemptedSite(selection.site);
      agentSummary.attemptedSites.push(selection.site);

      if (!AUTO_BOOK || DRY_RUN) {
        if (await openSiteDetails(page, selection)) {
          if (isSiteAlreadyHeld(selection.site)) continue;
          await claimSuccess(agentId, account, selection.site, 'site-details', selection.detailsUrl);
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
        continue;
      }

      if (!reserveAccountBookingSite(account.storageKey, selection.site)) {
        console.log(`${label}Skipping ${selection.site}; another agent for ${account.displayName} is already attempting it.`);
        booker.recordSkip(selection.site, 'already-reserved-for-account', agentId);
        agentSummary.skippedSites.push({ site: selection.site, reason: 'already-reserved-for-account' });
        continue;
      }

      try {
        const queuedAhead = booker.pendingAttemptCount;
        if (queuedAhead > 0) {
          console.log(`${label}Waiting for ${queuedAhead} earlier booking attempt(s) for ${account.displayName} before trying ${selection.site}.`);
        }

        const bookingResult = await runtime.attemptBooking({
          account,
          agentId,
          selection,
          targetDate: TARGET_DATE,
          stayLength: STAY_LENGTH,
          agentLabel: label,
          headed: IS_HEADED,
          checkoutAuthMode: CHECKOUT_AUTH_MODE,
          onCartFailure: async () => {
            agentSummary.outcome = 'cart-failed';
            await registerCartFailure(agentId, account, selection.site);
          },
          onCartVerified: async (siteIds) => {
            const { shouldClose } = booker.recordVerifiedCartSites(siteIds);
            if (shouldClose) {
              await cancelRemainingAgents(account.storageKey, agentId);
            }
          },
          onCartAttemptSettled: async (result) => {
            agentSummary.cartSitesBefore = result.cartSitesBefore;
            agentSummary.cartSitesAfter = result.cartSitesAfter;
            agentSummary.cartConfirmationSource = result.confirmationSource;
            agentSummary.finalAttemptUrl = result.finalUrl;
            agentSummary.clickedCartSelectors = result.clickedSelectors;
            agentSummary.checkoutAuthEncountered = result.checkoutAuthEncountered;
            agentSummary.cartVerificationError = result.verificationError;
          },
          onHoldSuccess: async () => {
            const claimed = await claimSuccess(agentId, account, selection.site, 'order-details', selection.detailsUrl);
            if (claimed) {
              agentSummary.heldSite = selection.site;
              finishAgentRun(agentSummary, 'order-details-held');
            }
            return claimed;
          },
          onFailureArtifact: (path) => {
            agentSummary.artifacts.failureScreenshotPaths.push(path);
          },
          onSuccessArtifact: (path) => {
            agentSummary.artifacts.successScreenshotPath = path;
          },
        });

        if (bookingResult === 'success') {
          return;
        }

        if (bookingResult === 'stopped') {
          finishAgentRun(agentSummary, 'stopped');
          break;
        }
      } finally {
        releaseAccountBookingSite(account.storageKey, selection.site);
        await reconcileVerifiedCartState(account);
      }
    }
    if (!agentSummary.finishedAt) {
      finishAgentRun(agentSummary, agentSummary.outcome === 'cart-failed' ? 'cart-failed' : 'exhausted');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isClosedContextError(message) && shouldStopAgent(agentId, account.storageKey)) {
      finishAgentRun(agentSummary, 'stopped');
      return;
    }
    console.error(`[Agent ${agentId}] Error: ${error}`);
    finishAgentRun(agentSummary, 'error', message);
  } finally {
    if (fallbackSearchContext) {
      await fallbackSearchContext.close().catch(() => {});
    }
    activeContexts.delete(agentId);
    await context.close().catch(() => {});
  }
}
async function launchCapture(targetSites: string[]): Promise<CaptureOutcome> {
  // 1. Ensure we have a valid session before starting any agents
  readyAccountsForRun = [];
  if (SKIP_SESSION_PREFLIGHT) {
    readyAccountsForRun = [...configuredAccounts];
    for (const account of configuredAccounts) {
      sessionPreflightTelemetry.push({
        account: account.displayName,
        result: 'skipped',
        checkedAt: new Date().toISOString(),
      });
    }
    console.log('[Race] Session preflight skipped.');
  } else {
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
  }

  if (readyAccountsForRun.length === 0) {
    console.error('Pre-flight validation failed. Cannot proceed with capture.');
    return 'auth-failed';
  }

  if (PROFILE_MODE === 'persistent' && !fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  if (PROFILE_MODE === 'persistent' && RESET_PROFILES) {
    for (const account of readyAccountsForRun) {
      const accountProfileDir = `${PROFILE_DIR}/${account.storageKey}`;
      if (fs.existsSync(accountProfileDir)) {
        console.log(`[${account.displayName}] Resetting persistent agent profiles at ${accountProfileDir}.`);
        fs.rmSync(accountProfileDir, { recursive: true, force: true });
      }
    }
  }

  let browser: any = null;
  if (PROFILE_MODE !== 'persistent') {
    browser = await chromium.launch({ headless: !IS_HEADED });
  }

  const agentSpecs = allocateAgents(readyAccountsForRun, CONCURRENCY, targetSites);
  allocatedAgentCountForRun = agentSpecs.length;
  for (const account of readyAccountsForRun) {
    let bookerContext: BrowserContext;
    const sessionPath = getReadableSessionPath(account.account);
    const hasSession = sessionExists(account.account);

    if (PROFILE_MODE === 'persistent') {
      const bookerPath = `${PROFILE_DIR}/${account.storageKey}/booker`;
      const options = { headless: !IS_HEADED, timezoneId: 'America/Denver' };
      bookerContext = await chromium.launchPersistentContext(bookerPath, options);
      if (hasSession) {
        console.log(`[${account.displayName}][Booker] Refreshing session state...`);
        await injectSession(bookerContext, account.account);
      }
    } else {
      bookerContext = await browser!.newContext({
        storageState: hasSession ? sessionPath : undefined,
        timezoneId: 'America/Denver',
      });
    }

    const booker = accountBookers.get(account.storageKey);
    if (booker) {
      accountBookerRuntimes.set(account.storageKey, new AccountBookerRuntime(booker, bookerContext));
    }
  }

  if (AUTO_BOOK && !DRY_RUN && !SKIP_CART_PREFLIGHT) {
    let preflightCartBlocked = false;
    for (const account of readyAccountsForRun) {
      const runtime = accountBookerRuntimes.get(account.storageKey);
      if (!runtime) {
        continue;
      }

      const cartState = await inspectCartState(
        runtime.context,
        `[Pre-Flight][${account.displayName}][Cart] `,
        account.account,
        IS_HEADED,
        CHECKOUT_AUTH_MODE,
      );
      cartPreflightTelemetry.push({
        account: account.displayName,
        result: cartState.error ? 'error' : cartState.siteIds.length > 0 ? 'non-empty' : 'empty',
        siteIds: cartState.siteIds,
        checkedAt: new Date().toISOString(),
        error: cartState.error,
      });

      if (cartState.error) {
        preflightCartBlocked = true;
        console.error(`[${account.displayName}] Unable to verify pre-flight cart state: ${cartState.error}`);
        continue;
      }

      if (cartState.siteIds.length > 0) {
        preflightCartBlocked = true;
        console.error(
          `[${account.displayName}] Pre-flight cart is not empty: ${cartState.siteIds.join(', ')}. Clear existing holds before running live validation.`,
        );
      }
    }

    if (preflightCartBlocked) {
      for (const runtime of accountBookerRuntimes.values()) {
        await runtime.close().catch(() => {});
      }
      accountBookerRuntimes.clear();
      if (browser) {
        await browser.close().catch(() => {});
      }
      return 'error';
    }
  } else if (AUTO_BOOK && !DRY_RUN && SKIP_CART_PREFLIGHT) {
    console.log('[Race] Cart preflight skipped.');
  }

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
  for (const runtime of accountBookerRuntimes.values()) {
    await runtime.close().catch(() => {});
  }
  accountBookerRuntimes.clear();
  if (browser) await browser.close();
  return getAllHolds().length > 0 ? 'success' : 'no-availability';
}

async function startRace(): Promise<CaptureOutcome> {
  console.log('--- Bear Lake Sniper Mode ---');
  requestedSitesForRun = rankRequestedSitesForCapture(
    getInitialTargetSites(TARGET_TIME ?? undefined, SITE_ALLOWLIST),
    AVAILABILITY_SNAPSHOT,
    loadedSiteList,
  );
  if (TARGET_TIME) {
    return launchCapture(requestedSitesForRun);
  }

  const result = await waitForAvailability();
  if (result.length === 0) {
    return 'no-availability';
  }

  let targetSites = result.map((s) => s.site);
  if (SITE_ALLOWLIST.length > 0) {
    targetSites = filterTargetSiteIds(targetSites, SITE_ALLOWLIST);
    if (targetSites.length === 0) {
      console.log('No available sites match your --sites allowlist.');
      return 'no-availability';
    }
  }
  targetSites = rankRequestedSitesForCapture(targetSites, AVAILABILITY_SNAPSHOT, loadedSiteList);
  requestedSitesForRun = targetSites;
  return launchCapture(targetSites);
}

startRace()
  .then((outcome) => {
    const runFinishedAt = Date.now();
    for (const booker of accountBookers.values()) {
      if (!booker.stopReason && booker.holds.length < booker.maxHolds) {
        booker.setStopReason('candidate-exhausted');
      }
    }
    const holds = getAllHolds();
    const winningHold = holds[0] ?? null;
    const summary: RunSummary = {
      timestamp: new Date(runFinishedAt).toISOString(),
      runStartedAt: new Date(RUN_STARTED_AT).toISOString(),
      runFinishedAt: new Date(runFinishedAt).toISOString(),
      durationMs: runFinishedAt - RUN_STARTED_AT,
      targetDate: TARGET_DATE,
      stayLength: STAY_LENGTH,
      loop: LOOP,
      targetTime: TARGET_TIME ?? undefined,
      monitorIntervalMins: MONITOR_INTERVAL_MINS,
      launchMode: LAUNCH_MODE,
      checkoutAuthMode: CHECKOUT_AUTH_MODE,
      autoBook: AUTO_BOOK,
      dryRun: DRY_RUN,
      headed: IS_HEADED,
      profileMode: PROFILE_MODE,
      notificationProfile: NOTIFICATION_PROFILE,
      availabilitySnapshot: AVAILABILITY_SNAPSHOT_PATH,
      accountsConfigured: configuredAccounts.map((account) => account.displayName),
      accountsReady: readyAccountsForRun.map((account) => account.displayName),
      accountsWithHolds: Array.from(accountBookers.values())
        .filter((booker) => booker.holds.length > 0)
        .map((booker) => booker.account.displayName),
      agentCount: allocatedAgentCountForRun,
      bookingMode: BOOKING_MODE,
      maxHolds: MAX_HOLDS,
      siteListSource: SITE_LIST_SOURCE,
      requestedSites: requestedSitesForRun,
      availableSites: availabilityTelemetry.matchedSites,
      holds,
      winningAgent: winningHold?.agentId ?? null,
      winningSite: winningHold?.site ?? null,
      status: outcome === 'success' ? 'success' : outcome,
      sessionPreflight: sessionPreflightTelemetry,
      cartPreflight: cartPreflightTelemetry,
      availabilityCheck: availabilityTelemetry.startedAt && availabilityTelemetry.finishedAt
        ? {
            startedAt: availabilityTelemetry.startedAt,
            finishedAt: availabilityTelemetry.finishedAt,
            matchedSites: availabilityTelemetry.matchedSites,
            allowlistApplied: availabilityTelemetry.allowlistApplied,
          }
        : undefined,
      accounts: buildAccountRunSummaries(),
      agents: Array.from(agentRunSummaries.values()).sort((a, b) => a.agentId - b.agentId),
    };
    writeRunSummary(summary);
    if (summary.holds.length > 0) {
      notifyFinalInventorySummary(summary, NOTIFICATION_PROFILE);
    }
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
    for (const booker of accountBookers.values()) {
      if (!booker.stopReason && booker.holds.length < booker.maxHolds) {
        booker.setStopReason('candidate-exhausted');
      }
    }
    const holds = getAllHolds();
    const winningHold = holds[0] ?? null;
    const summary: RunSummary = {
      timestamp: new Date(runFinishedAt).toISOString(),
      runStartedAt: new Date(RUN_STARTED_AT).toISOString(),
      runFinishedAt: new Date(runFinishedAt).toISOString(),
      durationMs: runFinishedAt - RUN_STARTED_AT,
      targetDate: TARGET_DATE,
      stayLength: STAY_LENGTH,
      loop: LOOP,
      targetTime: TARGET_TIME ?? undefined,
      monitorIntervalMins: MONITOR_INTERVAL_MINS,
      launchMode: LAUNCH_MODE,
      checkoutAuthMode: CHECKOUT_AUTH_MODE,
      autoBook: AUTO_BOOK,
      dryRun: DRY_RUN,
      headed: IS_HEADED,
      profileMode: PROFILE_MODE,
      notificationProfile: NOTIFICATION_PROFILE,
      availabilitySnapshot: AVAILABILITY_SNAPSHOT_PATH,
      accountsConfigured: configuredAccounts.map((account) => account.displayName),
      accountsReady: readyAccountsForRun.map((account) => account.displayName),
      accountsWithHolds: Array.from(accountBookers.values())
        .filter((booker) => booker.holds.length > 0)
        .map((booker) => booker.account.displayName),
      agentCount: allocatedAgentCountForRun,
      bookingMode: BOOKING_MODE,
      maxHolds: MAX_HOLDS,
      siteListSource: SITE_LIST_SOURCE,
      requestedSites: requestedSitesForRun,
      availableSites: availabilityTelemetry.matchedSites,
      holds,
      winningAgent: winningHold?.agentId ?? null,
      winningSite: winningHold?.site ?? null,
      status: 'error',
      sessionPreflight: sessionPreflightTelemetry,
      cartPreflight: cartPreflightTelemetry,
      availabilityCheck: availabilityTelemetry.startedAt && availabilityTelemetry.finishedAt
        ? {
            startedAt: availabilityTelemetry.startedAt,
            finishedAt: availabilityTelemetry.finishedAt,
            matchedSites: availabilityTelemetry.matchedSites,
            allowlistApplied: availabilityTelemetry.allowlistApplied,
          }
        : undefined,
      accounts: buildAccountRunSummaries(),
      agents: Array.from(agentRunSummaries.values()).sort((a, b) => a.agentId - b.agentId),
    };
    writeRunSummary(summary);
    if (summary.holds.length > 0) {
      notifyFinalInventorySummary(summary, NOTIFICATION_PROFILE);
    }
    writeCaptureResultArtifact('error');
    process.exitCode = CAPTURE_EXIT_CODES.error;
  });
