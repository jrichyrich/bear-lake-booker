import { parseArgs } from 'util';
import { searchAvailability, type SearchResult } from './reserveamerica';
import { loadAvailabilitySnapshot, rankSiteIdsWithSnapshot } from './availability-snapshots';
import { loadSiteList } from './site-lists';
import { buildAvailabilityRow, buildDateRange, normalizeRequestedSites, type AvailabilityRow } from './availability-utils';

const { values } = parseArgs({
  options: {
    dateFrom: { type: 'string' },
    dateTo: { type: 'string' },
    length: { type: 'string', short: 'l', default: '1' },
    loop: { type: 'string', short: 'o', default: 'BIRCH' },
    sites: { type: 'string' },
    siteList: { type: 'string' },
    availabilitySnapshot: { type: 'string' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !values.dateFrom) {
  console.log(`
Bear Lake Booker - Full-Loop Availability Search

Usage:
  npm run availability -- --dateFrom MM/DD/YYYY [options]

Options:
  --dateFrom <MM/DD/YYYY>      First arrival date to search
  --dateTo <MM/DD/YYYY>        Last arrival date to search [default: same as dateFrom]
  -l, --length <nights>        Length of stay [default: 1]
  -o, --loop <name>            Loop name [default: BIRCH]
  --sites <csv>                Explicit site allowlist override
  --siteList <name-or-path>    Ranked site list from camp sites or a path
  --availabilitySnapshot <path>  Annotate output using a stored availability snapshot
  --json                       Print machine-readable JSON after the console summary
  -h, --help                   Show help
  `);
  process.exit(values.help ? 0 : 1);
}

const dateFrom = values.dateFrom as string;
const dateTo = typeof values.dateTo === 'string' ? values.dateTo : undefined;
const stayLength = values.length as string;
const loop = values.loop as string;
const explicitSites = typeof values.sites === 'string'
  ? normalizeRequestedSites(values.sites.split(','))
  : [];
const loadedSiteList = explicitSites.length === 0 && typeof values.siteList === 'string'
  ? loadSiteList(values.siteList)
  : null;
const requestedSites = explicitSites.length > 0
  ? explicitSites
  : loadedSiteList?.siteIds ?? [];
const siteListSource = loadedSiteList?.sourcePath;
const availabilitySnapshotPath = typeof values.availabilitySnapshot === 'string'
  ? values.availabilitySnapshot
  : undefined;
const availabilitySnapshot = availabilitySnapshotPath
  ? loadAvailabilitySnapshot(availabilitySnapshotPath)
  : null;
const printJson = values.json === true;

type AvailabilityReport = {
  searchedAt: string;
  loop: string;
  stayLength: string;
  siteListSource?: string;
  requestedSites: string[];
  results: Array<AvailabilityRow & Pick<SearchResult, 'requestedSites' | 'returnedRequestedSites' | 'missingRequestedSites'>>;
};

function printRow(row: AvailabilityRow): void {
  console.log(`${row.date} | bookableNow=${row.bookableNow ? 'yes' : 'no'} | pages=${row.pageCount} | loopSites=${row.totalLoopSitesSeen}`);
  console.log(`  available (${row.availableSites.length}): ${formatSiteBucket(row.availableSites)}`);
  console.log(`  not available (${row.unavailableSites.length}): ${formatSiteBucket(row.unavailableSites)}`);
  console.log(`  not returned (${row.notReturnedSites.length}): ${formatSiteBucket(row.notReturnedSites)}`);
  if (row.snapshotRankedSites && row.snapshotRankedSites.length > 0) {
    console.log(`  snapshot-ranked: ${formatSiteBucket(row.snapshotRankedSites.slice(0, 10))}`);
  }
}

function formatSiteBucket(siteIds: string[]): string {
  return siteIds.length > 0 ? siteIds.join(', ') : '-';
}

async function main(): Promise<void> {
  if (requestedSites.length === 0) {
    throw new Error('Availability search requires --siteList or --sites so the report can focus on your preferred sites.');
  }

  const dates = buildDateRange(dateFrom, dateTo);
  const results: AvailabilityReport['results'] = [];

  console.log('--- Bear Lake Booker: Availability Search ---');
  console.log(`Loop: ${loop}`);
  console.log(`Stay length: ${stayLength}`);
  console.log(`Dates: ${dates[0]}${dates.length > 1 ? ` -> ${dates[dates.length - 1]}` : ''}`);
  console.log(`Requested sites (${requestedSites.length}): ${requestedSites.join(', ')}`);
  if (siteListSource) {
    console.log(`Site list source: ${siteListSource}`);
  }
  if (availabilitySnapshotPath) {
    console.log(`Availability snapshot: ${availabilitySnapshotPath}`);
  }
  console.log('');

  for (const date of dates) {
    const searchResult = await searchAvailability({
      date,
      length: stayLength,
      loop,
      requestedSites,
    });

    const snapshotRankedSites = rankSiteIdsWithSnapshot(requestedSites, availabilitySnapshot);
    const row = buildAvailabilityRow(date, searchResult, requestedSites, siteListSource, snapshotRankedSites);
    results.push({
      ...row,
      ...(searchResult.requestedSites ? { requestedSites: searchResult.requestedSites } : {}),
      ...(searchResult.returnedRequestedSites ? { returnedRequestedSites: searchResult.returnedRequestedSites } : {}),
      ...(searchResult.missingRequestedSites ? { missingRequestedSites: searchResult.missingRequestedSites } : {}),
    });
    printRow(row);
  }

  if (!printJson) {
    return;
  }

  const report: AvailabilityReport = {
    searchedAt: new Date().toISOString(),
    loop,
    stayLength,
    requestedSites,
    results,
    ...(siteListSource ? { siteListSource } : {}),
  };
  console.log('');
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
