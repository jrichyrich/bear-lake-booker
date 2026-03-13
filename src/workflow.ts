import { parseArgs } from 'util';
import { spawnSync } from 'child_process';
import { classifyArrivalSnapshot, writeArrivalShortlistJson, writeArrivalShortlistMarkdown } from './arrival-shortlists';
import {
  findMatchingAvailabilitySnapshots,
  loadLatestAvailabilitySnapshot,
  resolveLatestAvailabilitySnapshotPath,
  type AvailabilitySnapshot,
} from './availability-snapshots';
import { buildArrivalStatusMatrix, buildStayWindowStatusMatrix } from './site-availability-utils';
import { loadSiteList } from './site-lists';
import { loadWorkflowConfig, WORKFLOW_CONFIG_FILENAME } from './workflow-config';

function parseSlashDate(value: string): Date {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid date "${value}". Expected MM/DD/YYYY.`);
  }

  return new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
}

function formatSlashDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

function addDays(value: string, days: number): string {
  const date = parseSlashDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatSlashDate(date);
}

function formatLocalClockTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function buildValidationLaunchTime(now = new Date(), leadSeconds = 90): string {
  return formatLocalClockTime(new Date(now.getTime() + leadSeconds * 1000));
}

function runCli(entryFile: string, args: string[]): void {
  const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(npxCommand, ['tsx', entryFile, ...args], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function findLatestExactFitSnapshot(input: {
  loop: string;
  stayLength: string;
  targetDate: string;
  siteListSource: string;
}): {
  snapshotPath: string;
  snapshot: AvailabilitySnapshot;
  exactFitSites: string[];
} | null {
  const matches = findMatchingAvailabilitySnapshots({
    loop: input.loop,
    stayLength: input.stayLength,
    targetDate: input.targetDate,
    siteListSource: input.siteListSource,
    snapshotKind: 'site-calendar',
  });

  for (const { snapshotPath, snapshot } of matches) {
    const shortlist = classifyArrivalSnapshot(snapshot, input.targetDate, snapshotPath);
    const exactFitSites = shortlist.exactFitSites.map((site) => site.site);
    if (exactFitSites.length > 0) {
      return {
        snapshotPath,
        snapshot,
        exactFitSites,
      };
    }
  }

  return null;
}

function printHelp(configPath: string | null, defaults: {
  loop: string;
  siteList: string;
  scoutWindowDays: number;
  launchTime: string;
  accounts: string[];
  bookingConcurrency: number;
}): void {
  console.log(`
Bear Lake Booker - Guided Workflow

Use this when you want the "find sites before 8 AM, then book them at 8 AM" flow
without remembering the lower-level flags.

Usage:
  bear-lake help
  bear-lake scout --date MM/DD/YYYY --length <nights>
  bear-lake prep --date MM/DD/YYYY --length <nights>
  bear-lake validate --date MM/DD/YYYY --length <nights>
  bear-lake rehearse --date MM/DD/YYYY --length <nights>
  bear-lake book --date MM/DD/YYYY --length <nights>

Local without install:
  npm run cli -- help
  npm run cli -- scout --date MM/DD/YYYY --length <nights>

Commands:
  scout    Run the pre-launch arrival sweep and save a shortlist
  prep     Validate session/cart and freeze the exact-fit sites from the latest scout snapshot
  validate Prove the scout shortlist feeds booking by running a near-term dry-run launch
  rehearse Run the direct race dry run against the latest scout snapshot that still has exact-fit sites
  book     Use the latest matching scout snapshot to build a site list and start the 8 AM booking flow

Useful options:
  --showMatrix   Print the website-style stay-window matrix in the guided scout summary
  --parallelAccounts  When used with "prep", validate account sessions/carts concurrently
  --skipCartPreflight  When used with "prep", "validate", or "book", skip early cart preflight
  --dryRun       When used with "book", open the booking flow without trying to hold a site

Optional config:
  ${WORKFLOW_CONFIG_FILENAME}

Loaded config:
  ${configPath ?? '(none; using defaults)'}

Current defaults:
  loop=${defaults.loop}
  siteList=${defaults.siteList}
  scoutWindowDays=${defaults.scoutWindowDays}
  launchTime=${defaults.launchTime}
  bookingConcurrency=${defaults.bookingConcurrency}
  accounts=${defaults.accounts.join(', ') || '(default account)'}

Examples:
  bear-lake scout --date 07/11/2026 --length 14
  bear-lake scout --date 07/11/2026 --length 14 --showMatrix
  bear-lake prep --date 07/11/2026 --length 14
  bear-lake prep --date 07/11/2026 --length 14 --accounts lisa@gmail.com,jason@gmail.com --parallelAccounts
  bear-lake validate --date 07/11/2026 --length 14
  bear-lake rehearse --date 07/11/2026 --length 14
  bear-lake book --date 07/11/2026 --length 14
  bear-lake book --date 07/11/2026 --length 14 --dryRun
`);
}

const { values, positionals } = parseArgs({
  options: {
    date: { type: 'string', short: 'd' },
    length: { type: 'string', short: 'l' },
    loop: { type: 'string', short: 'o' },
    siteList: { type: 'string' },
    windowDays: { type: 'string' },
    scoutConcurrency: { type: 'string' },
    concurrency: { type: 'string', short: 'c' },
    launchTime: { type: 'string' },
    accounts: { type: 'string' },
    notificationProfile: { type: 'string' },
    headed: { type: 'boolean', default: false },
    noHeaded: { type: 'boolean', default: false },
    checkoutAuthMode: { type: 'string' },
    showMatrix: { type: 'boolean', default: false },
    parallelAccounts: { type: 'boolean', default: false },
    skipCartPreflight: { type: 'boolean', default: false },
    dryRun: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: true,
});

async function main(): Promise<void> {
  const command = positionals[0]?.trim().toLowerCase() ?? 'help';
  const { config, configPath } = loadWorkflowConfig();
  const loop = typeof values.loop === 'string' ? values.loop.trim() : config.loop;
  const siteList = typeof values.siteList === 'string' ? values.siteList.trim() : config.siteList;
  const scoutWindowDays = Math.max(1, parseInt((values.windowDays as string | undefined) ?? '', 10) || config.scoutWindowDays);
  const scoutConcurrency = Math.max(1, parseInt((values.scoutConcurrency as string | undefined) ?? '', 10) || config.scoutConcurrency);
  const bookingConcurrency = Math.max(1, parseInt((values.concurrency as string | undefined) ?? '', 10) || config.bookingConcurrency);
  const launchTime = typeof values.launchTime === 'string' ? values.launchTime.trim() : config.launchTime;
  const notificationProfile = values.notificationProfile === 'production' ? 'production' : config.notificationProfile;
  const headed = values.noHeaded === true ? false : values.headed === true ? true : config.headed;
  const checkoutAuthMode = values.checkoutAuthMode === 'auto'
    ? 'auto'
    : values.checkoutAuthMode === 'manual'
      ? 'manual'
      : config.checkoutAuthMode;
  const accounts = typeof values.accounts === 'string'
    ? values.accounts.split(',').map((value) => value.trim()).filter(Boolean)
    : config.accounts;
  const showMatrix = values.showMatrix === true;
  const parallelAccounts = values.parallelAccounts === true;
  const skipCartPreflight = values.skipCartPreflight === true;

  if (values.help || command === 'help') {
    printHelp(configPath, {
      loop,
      siteList,
      scoutWindowDays,
      launchTime,
      accounts,
      bookingConcurrency,
    });
    return;
  }

  const date = typeof values.date === 'string' ? values.date.trim() : '';
  const stayLength = typeof values.length === 'string' ? values.length.trim() : '';
  if (!date || !stayLength) {
    throw new Error('Workflow commands require both --date MM/DD/YYYY and --length <nights>.');
  }

  const loadedSiteList = loadSiteList(siteList);

  if (command === 'scout') {
    const endDate = addDays(date, scoutWindowDays - 1);
    runCli('src/site-availability.ts', [
      '--dateFrom', date,
      '--dateTo', endDate,
      '-l', stayLength,
      '-o', loop,
      '--siteList', siteList,
      '--concurrency', String(scoutConcurrency),
      '--arrivalSweep',
    ]);

    const snapshotPath = resolveLatestAvailabilitySnapshotPath({
      loop,
      stayLength,
      targetDate: date,
      siteListSource: loadedSiteList.sourcePath,
      snapshotKind: 'site-calendar',
    });
    if (!snapshotPath) {
      throw new Error('Scout finished, but no matching availability snapshot was found.');
    }

    const snapshot = loadLatestAvailabilitySnapshot({
      loop,
      stayLength,
      targetDate: date,
      siteListSource: loadedSiteList.sourcePath,
      snapshotKind: 'site-calendar',
    });
    if (!snapshot) {
      throw new Error('Scout finished, but the latest matching availability snapshot could not be loaded.');
    }

    const shortlist = classifyArrivalSnapshot(snapshot, date, snapshotPath);
    const shortlistJsonPath = writeArrivalShortlistJson(shortlist);
    const shortlistMarkdownPath = writeArrivalShortlistMarkdown(shortlist);

    console.log('');
    console.log('--- Guided Scout Summary ---');
    console.log(`Source snapshot: ${snapshotPath}`);
    console.log(`Arrival shortlist JSON: ${shortlistJsonPath}`);
    console.log(`Arrival shortlist Markdown: ${shortlistMarkdownPath}`);
    console.log(`Exact-fit sites for ${date}: ${shortlist.exactFitSites.map((site) => site.site).join(', ') || '-'}`);
    console.log(`Future-only sites for ${date}: ${shortlist.futureOnlySites.map((site) => site.site).join(', ') || '-'}`);
    if (showMatrix) {
      const stayWindowMatrix = buildStayWindowStatusMatrix(snapshot);
      const arrivalMatrix = buildArrivalStatusMatrix(snapshot);
      console.log('');
      if (!stayWindowMatrix) {
        console.log('Stay-window matrix unavailable: no per-day site calendar data was collected.');
      } else {
        console.log('--- Scout Stay-Window Status Matrix ---');
        console.log(stayWindowMatrix);
      }
      if (arrivalMatrix) {
        console.log('');
        console.log('--- Scout Arrival-Date Status Matrix ---');
        console.log(arrivalMatrix);
      }
    }
    console.log('');
    console.log(`Next step: bear-lake book --date ${date} --length ${stayLength}`);
    return;
  }

  if (command === 'prep' || command === 'validate' || command === 'rehearse' || command === 'book' || command === 'release') {
    const snapshotPath = resolveLatestAvailabilitySnapshotPath({
      loop,
      stayLength,
      targetDate: date,
      siteListSource: loadedSiteList.sourcePath,
      snapshotKind: 'site-calendar',
    });
    if (!snapshotPath) {
      throw new Error(`No matching scout snapshot found for ${date} (${stayLength} nights). Run "bear-lake scout --date ${date} --length ${stayLength}" first.`);
    }

    const snapshot = loadLatestAvailabilitySnapshot({
      loop,
      stayLength,
      targetDate: date,
      siteListSource: loadedSiteList.sourcePath,
      snapshotKind: 'site-calendar',
    });
    if (!snapshot) {
      throw new Error(`Unable to load the latest scout snapshot for ${date} (${stayLength} nights).`);
    }

    const exactFitSnapshot = command === 'rehearse'
      ? findLatestExactFitSnapshot({
          loop,
          stayLength,
          targetDate: date,
          siteListSource: loadedSiteList.sourcePath,
        })
      : null;
    const effectiveSnapshotPath = exactFitSnapshot?.snapshotPath ?? snapshotPath;
    const effectiveSnapshot = exactFitSnapshot?.snapshot ?? snapshot;
    const shortlist = classifyArrivalSnapshot(effectiveSnapshot, date, effectiveSnapshotPath);
    const exactFitSites = exactFitSnapshot?.exactFitSites ?? shortlist.exactFitSites.map((site) => site.site);
    if (exactFitSites.length === 0) {
      throw new Error(`No exact-fit sites were found for ${date} in the latest scout snapshot. Review ${effectiveSnapshotPath} before launching booking.`);
    }

    const effectiveLaunchTime = command === 'validate' || command === 'rehearse'
      ? buildValidationLaunchTime()
      : launchTime;

    const bookingArgs = command === 'rehearse'
      ? [
          '-d', date,
          '-l', stayLength,
          '-o', loop,
          '-c', String(bookingConcurrency),
          '--sites', exactFitSites.join(','),
          '--notificationProfile', notificationProfile,
          '--availabilitySnapshot', effectiveSnapshotPath,
          ...(accounts.length > 0 ? ['--accounts', accounts.join(',')] : []),
          '--headed',
          ...(checkoutAuthMode ? ['--checkoutAuthMode', checkoutAuthMode] : []),
          '--skipSessionPreflight',
          '--skipCartPreflight',
          '--dryRun',
          '--time', effectiveLaunchTime,
        ]
      : [
          ...(command === 'prep' ? [] : ['--launchTime', effectiveLaunchTime]),
          '-d', date,
          '-l', stayLength,
          '-o', loop,
          '-c', String(bookingConcurrency),
          '--sites', exactFitSites.join(','),
          '--notificationProfile', notificationProfile,
          '--availabilitySnapshot', effectiveSnapshotPath,
          ...(accounts.length > 0 ? ['--accounts', accounts.join(',')] : []),
          ...(headed ? ['--headed'] : []),
          ...(checkoutAuthMode ? ['--checkoutAuthMode', checkoutAuthMode] : []),
          ...(skipCartPreflight ? ['--skipCartPreflight'] : []),
          ...(command === 'prep'
            ? ['--prepOnly', ...(parallelAccounts ? ['--parallelAccounts'] : [])]
            : command === 'validate'
              ? ['--dryRun']
              : values.dryRun === true
                ? ['--dryRun']
                : ['--book']),
        ];

    console.log(command === 'prep'
      ? '--- Guided Prep Plan ---'
      : command === 'validate'
        ? '--- Guided Validation Plan ---'
        : command === 'rehearse'
          ? '--- Guided Rehearsal Plan ---'
        : '--- Guided Booking Plan ---');
    console.log(`Using scout snapshot: ${effectiveSnapshotPath}`);
    console.log(`Target sites: ${exactFitSites.join(', ')}`);
    if (command === 'prep') {
      console.log(`Intended launch time: ${launchTime}`);
      console.log(`Mode: ${skipCartPreflight ? 'session preflight only' : 'session/cart preflight only'} (${parallelAccounts ? 'parallel accounts' : 'sequential accounts'})`);
    } else if (command === 'validate') {
      console.log(`Validation launch time: ${effectiveLaunchTime}`);
      console.log(`Mode: dry-run handoff validation${skipCartPreflight ? ' (cart preflight skipped)' : ''}`);
    } else if (command === 'rehearse') {
      console.log(`Rehearsal launch time: ${effectiveLaunchTime}`);
      console.log('Mode: direct race dry run (session/cart preflight skipped)');
    } else {
      console.log(`Launch time: ${effectiveLaunchTime}`);
      console.log(`Mode: ${values.dryRun === true ? 'dry run' : 'book to Order Details'}${skipCartPreflight ? ' (cart preflight skipped)' : ''}`);
    }
    console.log('');

    runCli(command === 'rehearse' ? 'src/race.ts' : 'src/release.ts', bookingArgs);
    return;
  }

  throw new Error(`Unknown workflow command "${command}". Use "bear-lake help".`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
