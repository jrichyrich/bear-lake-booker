import { parseArgs } from 'util';
import { spawnSync } from 'child_process';
import { chromium } from 'playwright-extra';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

import { searchAvailability } from './reserveamerica';
import {
  loadAvailabilitySnapshot,
  loadLatestAvailabilitySnapshot,
  resolveLatestAvailabilitySnapshotPath,
  writeAvailabilitySnapshot,
  type AvailabilitySnapshot,
} from './availability-snapshots';
import { inspectCartState } from './automation';
import { sleep } from './automation';
import { ensureActiveSession } from './session-manager';
import { getAccountDisplayName, normalizeCliAccounts, sessionExists, getReadableSessionPath } from './session-utils';
import { normalizeNotificationProfile } from './notify';
import { loadSiteList } from './site-lists';
import {
  buildReleaseRaceArgs,
  resolveProjectionAt,
  resolveReleaseSchedule,
  resolveReleaseScoutSites,
} from './release-utils';
import { fetchSiteCalendarAvailability, resolveRequestedSiteRecords } from './site-calendar';
import { mapWithConcurrency } from './site-availability-utils';
import {
  buildProjectionEndDate,
  buildProjectionShortlistBasePath,
  classifyProjectionResults,
  computeExpectedWindowEdgeDate,
  formatLocalLaunchDate,
  writeProjectionShortlistJson,
  writeProjectionShortlistMarkdown,
  type ProjectionShortlist,
} from './projection-shortlists';

const args = process.argv.slice(2);

const { values } = parseArgs({
  args,
  options: {
    launchTime: { type: 'string' },
    prepOnly: { type: 'boolean', default: false },
    parallelAccounts: { type: 'boolean', default: false },
    skipCartPreflight: { type: 'boolean', default: false },
    date: { type: 'string', short: 'd', default: '07/22/2026' },
    length: { type: 'string', short: 'l', default: '6' },
    loop: { type: 'string', short: 'o', default: 'BIRCH' },
    concurrency: { type: 'string', short: 'c', default: '10' },
    accounts: { type: 'string' },
    sites: { type: 'string' },
    siteList: { type: 'string' },
    availabilitySnapshot: { type: 'string' },
    projectionMode: { type: 'string' },
    projectionPolicy: { type: 'string', default: 'exact-fit-only' },
    projectionLeadMinutes: { type: 'string', default: '10' },
    allowProjectionOutsideWindowEdge: { type: 'boolean', default: false },
    headed: { type: 'boolean', default: false },
    checkoutAuthMode: { type: 'string' },
    notificationProfile: { type: 'string', default: 'test' },
    scoutLeadMinutes: { type: 'string', default: '2' },
    warmupLeadSeconds: { type: 'string', default: '45' },
    help: { type: 'boolean', short: 'h' },
  },
  strict: false,
});

if (values.help || (!values.launchTime && values.prepOnly !== true)) {
  console.log(`
Bear Lake Booker - Booking / Rehearsal Wrapper

Usage:
  npm run book -- --launchTime HH:MM:SS [race options]
  npm run book -- --prepOnly [booking options]

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
  --availabilitySnapshot <path>  Rank preferred sites using a stored availability snapshot
  --projectionMode <mode>        Enable day-of projection flow (supported: window-edge)
  --projectionPolicy <policy>    exact-fit-only or allow-partial [default: exact-fit-only]
  --projectionLeadMinutes <mins> Minutes before launch to run the projection crawl [default: 10]
  --allowProjectionOutsideWindowEdge  Allow projection when target date is not today's 4-month edge
  --prepOnly                    Validate session + empty cart + resolved sites, then exit
  --parallelAccounts            In prep-only mode, validate account sessions/carts concurrently
  --skipCartPreflight           Skip cart preflight and only validate sessions
  --notificationProfile <name> test or production [default: test]
  --scoutLeadMinutes <mins>    Minutes before launch to freeze scout [default: 2]
  --warmupLeadSeconds <secs>   Seconds before launch to start race warmup [default: 45]

All remaining options are passed through to "npm run race".

Compatibility:
  "npm run release" still works as an alias for "npm run book".
  `);
  process.exit(values.help ? 0 : 1);
}

const launchTime = values.launchTime as string;
const prepOnly = values.prepOnly === true;
const parallelAccounts = values.parallelAccounts === true;
const skipCartPreflight = values.skipCartPreflight === true;
const targetDate = values.date as string;
const stayLength = values.length as string;
const loop = values.loop as string;
const concurrency = parseInt(values.concurrency as string, 10);
const scoutLeadMinutes = parseInt(values.scoutLeadMinutes as string, 10);
const warmupLeadSeconds = parseInt(values.warmupLeadSeconds as string, 10);
const projectionLeadMinutes = parseInt(values.projectionLeadMinutes as string, 10);
const explicitSites = typeof values.sites === 'string'
  ? values.sites.split(',').map((site) => site.trim().toUpperCase()).filter(Boolean)
  : [];
const siteListSpec = typeof values.siteList === 'string' ? values.siteList.trim() : '';
const explicitAvailabilitySnapshot = typeof values.availabilitySnapshot === 'string'
  ? values.availabilitySnapshot.trim()
  : '';
const requestedAccounts = typeof values.accounts === 'string'
  ? normalizeCliAccounts(values.accounts.split(','), '[Release] ')
  : [undefined];
const headed = values.headed === true;
const notificationProfile = normalizeNotificationProfile(values.notificationProfile as string | undefined);
const projectionMode = typeof values.projectionMode === 'string' ? values.projectionMode.trim().toLowerCase() : '';
const projectionPolicy = values.projectionPolicy === 'allow-partial' ? 'allow-partial' : 'exact-fit-only';
const allowProjectionOutsideWindowEdge = values.allowProjectionOutsideWindowEdge === true;
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

  if (skipCartPreflight) {
    console.log(`[Release][${displayName}] Cart preflight skipped.`);
    return;
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

async function resolveTargetSites(
  availabilitySnapshot: ReturnType<typeof loadAvailabilitySnapshot> | ReturnType<typeof loadLatestAvailabilitySnapshot>,
  loadedSiteList: ReturnType<typeof loadSiteList> | null,
): Promise<string[]> {
  const desiredCount = Math.max(concurrency, requestedAccounts.filter(Boolean).length || 1);
  if (explicitSites.length > 0) {
    return explicitSites;
  }

  const search = await searchAvailability({
    date: targetDate,
    length: stayLength,
    loop,
  });
  const selectedSites = resolveReleaseScoutSites({
    search,
    availabilitySnapshot,
    loadedSiteList,
    desiredCount,
  });
  if (selectedSites.length === 0) {
    throw new Error(`No ${loop} sites were available to target for ${targetDate} during the scout.`);
  }
  return selectedSites;
}

async function runProjectionShortlist(
  loadedSiteList: ReturnType<typeof loadSiteList> | null,
  launchDate: string,
): Promise<{
  shortlist: ProjectionShortlist;
  snapshotPath: string;
  shortlistJsonPath: string;
  shortlistMarkdownPath: string;
}> {
  const candidateSites = explicitSites.length > 0 ? explicitSites : loadedSiteList?.siteIds ?? [];
  if (candidateSites.length === 0) {
    throw new Error('Projection mode requires --siteList or --sites so it has a constrained site set to evaluate.');
  }

  const projectionEndDate = buildProjectionEndDate(targetDate, stayLength);
  const resolved = await resolveRequestedSiteRecords(targetDate, stayLength, loop, candidateSites);
  const projectionConcurrency = Math.min(Math.max(1, concurrency), 4);
  const results = await mapWithConcurrency(
    resolved.found,
    projectionConcurrency,
    (siteRecord) => fetchSiteCalendarAvailability(siteRecord, targetDate, stayLength, projectionEndDate),
  );

  const snapshot: AvailabilitySnapshot = {
    generatedAt: new Date().toISOString(),
    searchedAt: new Date().toISOString(),
    snapshotKind: 'projection',
    loop,
    stayLength,
    seedDate: targetDate,
    dateTo: projectionEndDate,
    requestedSites: candidateSites,
    missingSites: resolved.missing,
    results,
    ...(loadedSiteList?.sourcePath ? { siteListSource: loadedSiteList.sourcePath } : {}),
  };
  const snapshotPath = writeAvailabilitySnapshot(snapshot);

  const shortlist = classifyProjectionResults(results, targetDate, stayLength);
  shortlist.generatedAt = snapshot.generatedAt;
  shortlist.launchDate = launchDate;
  shortlist.loop = loop;
  if (loadedSiteList?.sourcePath) {
    shortlist.siteListSource = loadedSiteList.sourcePath;
  }

  const basePath = buildProjectionShortlistBasePath(shortlist);
  const shortlistJsonPath = writeProjectionShortlistJson(shortlist, `${basePath}.json`);
  const shortlistMarkdownPath = writeProjectionShortlistMarkdown(shortlist, `${basePath}.md`);

  return {
    shortlist,
    snapshotPath,
    shortlistJsonPath,
    shortlistMarkdownPath,
  };
}

async function main(): Promise<void> {
  if (prepOnly && projectionMode === 'window-edge') {
    throw new Error('Prep-only mode does not support projection mode. Run prep against an existing scout shortlist instead.');
  }

  const schedule = prepOnly
    ? null
    : resolveReleaseSchedule(new Date(), launchTime, scoutLeadMinutes, warmupLeadSeconds);
  const projectionAt = projectionMode === 'window-edge' && schedule
    ? resolveProjectionAt(schedule.launchAt, projectionLeadMinutes, schedule.warmupAt)
    : null;
  const loadedSiteList = explicitSites.length === 0 && siteListSpec ? loadSiteList(siteListSpec) : null;
  let resolvedAvailabilitySnapshotPath = explicitAvailabilitySnapshot
    || (loadedSiteList
      ? resolveLatestAvailabilitySnapshotPath({
          loop,
          stayLength,
          targetDate,
          siteListSource: loadedSiteList.sourcePath,
          snapshotKind: 'site-calendar',
        }) ?? ''
      : '');
  let availabilitySnapshot = resolvedAvailabilitySnapshotPath
    ? loadAvailabilitySnapshot(resolvedAvailabilitySnapshotPath)
    : null;

  console.log('--- Bear Lake Booker: Release / Rehearsal Wrapper ---');
  console.log(`[Release] Target date: ${targetDate}`);
  if (prepOnly) {
    console.log('[Release] Mode: prep-only preflight');
    if (launchTime) {
      console.log(`[Release] Intended launch time: ${launchTime}`);
    }
  } else if (schedule) {
    console.log(`[Release] Launch time: ${launchTime}`);
    console.log(`[Release] Scout time: ${formatClock(schedule.scoutAt)}`);
    console.log(`[Release] Warmup start: ${formatClock(schedule.warmupAt)}`);
  }
  if (skipCartPreflight) {
    console.log('[Release] Cart preflight: skipped');
  }
  if (projectionAt) {
    console.log(`[Release] Projection time: ${formatClock(projectionAt)}`);
    console.log(`[Release] Projection policy: ${projectionPolicy}`);
  }
  console.log(`[Release] Notification profile: ${notificationProfile}`);
  if (loadedSiteList) {
    console.log(`[Release] Site list source: ${loadedSiteList.sourcePath}`);
  }
  if (availabilitySnapshot) {
    console.log(`[Release] Availability snapshot: ${resolvedAvailabilitySnapshotPath}`);
  }
  console.log(`[Release] Accounts: ${requestedAccounts.map((account) => getAccountDisplayName(account)).join(', ')}`);

  if (prepOnly && parallelAccounts) {
    console.log('[Release] Account preflight mode: parallel');
    await Promise.all(requestedAccounts.map((account) => ensureSessionAndEmptyCart(account)));
  } else {
    if (prepOnly) {
      console.log('[Release] Account preflight mode: sequential');
    }
    for (const account of requestedAccounts) {
      await ensureSessionAndEmptyCart(account);
    }
  }

  let resolvedSites: string[];
  if (projectionMode === 'window-edge') {
    if (!schedule) {
      throw new Error('Projection mode requires a launch schedule.');
    }
    const expectedEdgeDate = computeExpectedWindowEdgeDate(schedule.launchAt);
    if (targetDate !== expectedEdgeDate) {
      const warning = `[Release] Projection mode expects the window-edge target date ${expectedEdgeDate}, but got ${targetDate}.`;
      if (!allowProjectionOutsideWindowEdge) {
        throw new Error(`${warning} Re-run with --allowProjectionOutsideWindowEdge to override.`);
      }
      console.warn(warning);
    }

    if (!projectionAt) {
      throw new Error('Projection time was not resolved.');
    }
    await waitUntil(projectionAt, 'release-morning projection');
    const launchDate = formatLocalLaunchDate(schedule.launchAt);
    const projection = await runProjectionShortlist(loadedSiteList, launchDate);
    resolvedAvailabilitySnapshotPath = projection.snapshotPath;
    availabilitySnapshot = loadAvailabilitySnapshot(resolvedAvailabilitySnapshotPath);

    console.log('[Release] Projection shortlist generated:');
    console.log(`  Snapshot: ${projection.snapshotPath}`);
    console.log(`  Shortlist JSON: ${projection.shortlistJsonPath}`);
    console.log(`  Shortlist Markdown: ${projection.shortlistMarkdownPath}`);
    console.log(`  Exact fit sites: ${projection.shortlist.exactFitSites.map((site) => site.site).join(', ') || '-'}`);
    console.log(`  Partial fit sites: ${projection.shortlist.partialFitSites.map((site) => site.site).join(', ') || '-'}`);

    resolvedSites = projection.shortlist.exactFitSites.map((site) => site.site);
    if (resolvedSites.length === 0) {
      if (projectionPolicy === 'allow-partial') {
        resolvedSites = projection.shortlist.partialFitSites.map((site) => site.site);
      }
      if (resolvedSites.length === 0) {
        throw new Error(`[Release] Projection produced no exact-fit booking targets for ${targetDate}. Shortlist saved; stopping before launch.`);
      }
      console.warn('[Release] No exact-fit sites were found. Falling back to partial-fit sites because --projectionPolicy allow-partial was selected.');
    }
  } else {
    if (!prepOnly && explicitSites.length === 0 && schedule) {
      await waitUntil(schedule.scoutAt, 'site scout');
    }
    resolvedSites = explicitSites.length > 0
      ? explicitSites
      : await resolveTargetSites(availabilitySnapshot, loadedSiteList);
  }

  console.log('[Release] Resolved launch plan:');
  console.log(`  Date: ${targetDate}`);
  console.log(`  Loop: ${loop}`);
  if (prepOnly) {
    if (launchTime) {
      console.log(`  Intended launch time: ${launchTime}`);
    }
  } else if (schedule) {
    console.log(`  Launch time: ${launchTime}`);
    console.log(`  Warmup start: ${formatClock(schedule.warmupAt)}`);
  }
  console.log(`  Notification profile: ${notificationProfile}`);
  if (loadedSiteList) {
    console.log(`  Site list source: ${loadedSiteList.sourcePath}`);
  }
  if (availabilitySnapshot) {
    console.log(`  Availability snapshot generated: ${availabilitySnapshot.generatedAt}`);
  }
  console.log(`  Sites: ${resolvedSites.join(', ')}`);
  console.log(`  Accounts: ${requestedAccounts.map((account) => getAccountDisplayName(account)).join(', ')}`);

  if (prepOnly) {
    console.log('');
    console.log(`[Release] Prep completed successfully. Session${skipCartPreflight ? '' : ' and cart'} preflight passed.`);
    return;
  }

  await waitUntil(schedule!.warmupAt, 'race warmup');
  const raceArgs = buildReleaseRaceArgs(
    args,
    launchTime,
    resolvedSites,
    notificationProfile,
    loadedSiteList?.sourcePath,
    resolvedAvailabilitySnapshotPath || undefined,
  );
  raceArgs.push('--skipSessionPreflight');
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
