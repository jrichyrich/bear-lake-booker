import { parseArgs } from 'util';
import { loadSiteList } from './site-lists';
import {
  fetchSiteCalendarAvailability,
  resolveRequestedSiteRecords,
  type SiteCalendarResult,
} from './site-calendar';

const { values } = parseArgs({
  options: {
    dateFrom: { type: 'string' },
    dateTo: { type: 'string' },
    length: { type: 'string', short: 'l', default: '1' },
    loop: { type: 'string', short: 'o', default: 'BIRCH' },
    sites: { type: 'string' },
    siteList: { type: 'string' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || !values.dateFrom) {
  console.log(`
Bear Lake Booker - Per-Site Availability Calendar

Usage:
  npm run site-availability -- --dateFrom MM/DD/YYYY [options]

Options:
  --dateFrom <MM/DD/YYYY>      Starting arrival date for the site calendar crawl
  --dateTo <MM/DD/YYYY>        Optional last date to include in reported ranges
  -l, --length <nights>        Length of stay context [default: 1]
  -o, --loop <name>            Loop name [default: BIRCH]
  --sites <csv>                Explicit site allowlist override
  --siteList <name-or-path>    Ranked site list from camp sites or a path
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
  ? values.sites.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
  : [];
const loadedSiteList = explicitSites.length === 0 && typeof values.siteList === 'string'
  ? loadSiteList(values.siteList)
  : null;
const requestedSites = explicitSites.length > 0 ? explicitSites : loadedSiteList?.siteIds ?? [];
const siteListSource = loadedSiteList?.sourcePath;
const printJson = values.json === true;

type SiteAvailabilityReport = {
  searchedAt: string;
  loop: string;
  stayLength: string;
  seedDate: string;
  dateTo?: string;
  requestedSites: string[];
  missingSites: string[];
  siteListSource?: string;
  results: SiteCalendarResult[];
};

function formatRanges(result: SiteCalendarResult): string {
  if (result.availableRanges.length === 0) {
    return 'none';
  }

  return result.availableRanges
    .map((range) => `${range.startDate} -> ${range.endDate} (${range.nights} night${range.nights === 1 ? '' : 's'})`)
    .join('; ');
}

function printResult(result: SiteCalendarResult): void {
  console.log(`${result.site} (${result.loop}) | siteId=${result.siteId} | pages=${result.pagesFetched}`);
  console.log(`  seedDateBookableNow: ${result.seedDateBookableNow ? 'yes' : 'no'}`);
  console.log(`  maxReservationWindowDate: ${result.maxReservationWindowDate ?? '-'}`);
  console.log(`  firstVisibleDate: ${result.firstVisibleDate ?? '-'}`);
  console.log(`  lastVisibleDate: ${result.lastVisibleDate ?? '-'}`);
  console.log(`  firstAvailableDate: ${result.firstAvailableDate ?? '-'}`);
  console.log(`  maxConsecutiveNights: ${result.maxConsecutiveNights}`);
  console.log(`  availableRanges: ${formatRanges(result)}`);
}

async function main(): Promise<void> {
  if (requestedSites.length === 0) {
    throw new Error('Site availability requires --siteList or --sites so the crawl knows which sites to inspect.');
  }

  console.log('--- Bear Lake Booker: Site Availability Calendar ---');
  console.log(`Loop: ${loop}`);
  console.log(`Stay length: ${stayLength}`);
  console.log(`Seed date: ${dateFrom}`);
  if (dateTo) {
    console.log(`Reported through: ${dateTo}`);
  }
  console.log(`Requested sites (${requestedSites.length}): ${requestedSites.join(', ')}`);
  if (siteListSource) {
    console.log(`Site list source: ${siteListSource}`);
  }
  console.log('');

  const resolved = await resolveRequestedSiteRecords(dateFrom, stayLength, loop, requestedSites);
  const results: SiteCalendarResult[] = [];

  for (const siteRecord of resolved.found) {
    const result = await fetchSiteCalendarAvailability(siteRecord, dateFrom, stayLength, dateTo);
    results.push(result);
    printResult(result);
  }

  if (resolved.missing.length > 0) {
    console.log('');
    console.log(`Missing site IDs (${resolved.missing.length}): ${resolved.missing.join(', ')}`);
  }

  if (!printJson) {
    return;
  }

  const report: SiteAvailabilityReport = {
    searchedAt: new Date().toISOString(),
    loop,
    stayLength,
    seedDate: dateFrom,
    requestedSites,
    missingSites: resolved.missing,
    results,
    ...(dateTo ? { dateTo } : {}),
    ...(siteListSource ? { siteListSource } : {}),
  };
  console.log('');
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
