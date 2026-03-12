import { parseArgs } from 'util';
import { spawnSync } from 'child_process';
import { classifyArrivalSnapshot, writeArrivalShortlistJson, writeArrivalShortlistMarkdown } from './arrival-shortlists';
import { loadLatestAvailabilitySnapshot, resolveLatestAvailabilitySnapshotPath } from './availability-snapshots';
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

function runCli(entryFile: string, args: string[]): void {
  const result = spawnSync('npx', ['tsx', entryFile, ...args], {
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
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
  npm run workflow -- help
  npm run workflow -- scout --date MM/DD/YYYY --length <nights>
  npm run workflow -- book --date MM/DD/YYYY --length <nights>

Commands:
  scout    Run the pre-launch arrival sweep, print the arrival matrix, and save a shortlist
  book     Use the latest matching scout snapshot to build a site list and start the 8 AM booking flow

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
  npm run workflow -- scout --date 07/11/2026 --length 14
  npm run workflow -- book --date 07/11/2026 --length 14
  npm run workflow -- book --date 07/11/2026 --length 14 --dryRun
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
      '--arrivalMatrix',
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
    console.log('');
    console.log(`Next step: npm run workflow -- book --date ${date} --length ${stayLength}`);
    return;
  }

  if (command === 'book' || command === 'release') {
    const snapshotPath = resolveLatestAvailabilitySnapshotPath({
      loop,
      stayLength,
      targetDate: date,
      siteListSource: loadedSiteList.sourcePath,
      snapshotKind: 'site-calendar',
    });
    if (!snapshotPath) {
      throw new Error(`No matching scout snapshot found for ${date} (${stayLength} nights). Run "npm run workflow -- scout --date ${date} --length ${stayLength}" first.`);
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

    const shortlist = classifyArrivalSnapshot(snapshot, date, snapshotPath);
    const exactFitSites = shortlist.exactFitSites.map((site) => site.site);
    if (exactFitSites.length === 0) {
      throw new Error(`No exact-fit sites were found for ${date} in the latest scout snapshot. Review ${snapshotPath} before launching booking.`);
    }

    const bookingArgs = [
      '--launchTime', launchTime,
      '-d', date,
      '-l', stayLength,
      '-o', loop,
      '-c', String(bookingConcurrency),
      '--sites', exactFitSites.join(','),
      '--notificationProfile', notificationProfile,
      '--availabilitySnapshot', snapshotPath,
      ...(accounts.length > 0 ? ['--accounts', accounts.join(',')] : []),
      ...(headed ? ['--headed'] : []),
      ...(checkoutAuthMode ? ['--checkoutAuthMode', checkoutAuthMode] : []),
      ...(values.dryRun === true ? ['--dryRun'] : ['--book']),
    ];

    console.log('--- Guided Booking Plan ---');
    console.log(`Using scout snapshot: ${snapshotPath}`);
    console.log(`Target sites: ${exactFitSites.join(', ')}`);
    console.log(`Launch time: ${launchTime}`);
    console.log(`Mode: ${values.dryRun === true ? 'dry run' : 'book to Order Details'}`);
    console.log('');

    runCli('src/release.ts', bookingArgs);
    return;
  }

  throw new Error(`Unknown workflow command "${command}". Use "npm run workflow -- help".`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
