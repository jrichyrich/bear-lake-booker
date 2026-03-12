import { parseArgs } from 'util';
import { loadSiteList } from './site-lists';
import {
  buildAvailabilitySnapshotPath,
  writeAvailabilitySnapshot,
  type AvailabilitySnapshot,
} from './availability-snapshots';
import {
  fetchSiteArrivalSweep,
  fetchSiteCalendarAvailability,
  resolveRequestedSiteRecords,
} from './site-calendar';
import {
  buildArrivalStatusMatrix,
  formatSiteCalendarResult,
  mapWithConcurrency,
  resolveArrivalSweepEndDate,
  writeSiteAvailabilityReport,
} from './site-availability-utils';

const { values } = parseArgs({
  options: {
    dateFrom: { type: 'string' },
    dateTo: { type: 'string' },
    length: { type: 'string', short: 'l', default: '1' },
    loop: { type: 'string', short: 'o', default: 'BIRCH' },
    sites: { type: 'string' },
    siteList: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    out: { type: 'string' },
    arrivalSweep: { type: 'boolean', default: false },
    arrivalMatrix: { type: 'boolean', default: false },
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
  --concurrency <n>            Number of site crawls to run in parallel [default: 4]
  --out <path>                 Write an additional report file (.md, .csv, or .json)
  --arrivalSweep               Probe each arrival date in the window for this stay length
  --arrivalMatrix              Print a site-by-site arrival-status matrix (requires --arrivalSweep)
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
const concurrency = Math.max(1, parseInt((values.concurrency as string) ?? '4', 10) || 4);
const outputPath = typeof values.out === 'string' ? values.out : undefined;
const arrivalSweep = values.arrivalSweep === true;
const arrivalMatrix = values.arrivalMatrix === true;
const printJson = values.json === true;

async function main(): Promise<void> {
  if (requestedSites.length === 0) {
    throw new Error('Site availability requires --siteList or --sites so the crawl knows which sites to inspect.');
  }
  if (arrivalMatrix && !arrivalSweep) {
    throw new Error('Site availability requires --arrivalSweep when using --arrivalMatrix.');
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
  console.log(`Concurrency: ${concurrency}`);
  if (arrivalSweep) {
    console.log('Arrival sweep: enabled');
  }
  console.log('');

  const arrivalSweepEndDate = resolveArrivalSweepEndDate(dateFrom, dateTo, arrivalSweep);
  const resolved = await resolveRequestedSiteRecords(dateFrom, stayLength, loop, requestedSites);
  const results = await mapWithConcurrency(
    resolved.found,
    concurrency,
    async (siteRecord) => {
      const result = await fetchSiteCalendarAvailability(siteRecord, dateFrom, stayLength, dateTo);
      if (!arrivalSweepEndDate) {
        return result;
      }

      const sweep = await fetchSiteArrivalSweep(siteRecord, dateFrom, stayLength, arrivalSweepEndDate);
      return {
        ...result,
        ...sweep,
      };
    },
  );

  for (const result of results) {
    for (const line of formatSiteCalendarResult(result)) {
      console.log(line);
    }
  }

  if (resolved.missing.length > 0) {
    console.log('');
    console.log(`Missing site IDs (${resolved.missing.length}): ${resolved.missing.join(', ')}`);
  }

  const report: AvailabilitySnapshot = {
    generatedAt: new Date().toISOString(),
    searchedAt: new Date().toISOString(),
    snapshotKind: 'site-calendar',
    loop,
    stayLength,
    seedDate: dateFrom,
    requestedSites,
    missingSites: resolved.missing,
    results,
    ...(dateTo ? { dateTo } : {}),
    ...(siteListSource ? { siteListSource } : {}),
  };

  const snapshotPath = writeAvailabilitySnapshot(report);
  console.log('');
  console.log(`Wrote availability snapshot to ${snapshotPath}`);

  if (arrivalMatrix) {
    const matrix = buildArrivalStatusMatrix(report);
    console.log('');
    if (!matrix) {
      console.log('Arrival status matrix unavailable: no arrival sweep data was collected.');
    } else {
      console.log('--- Arrival Status Matrix ---');
      console.log(matrix);
    }
  }

  if (outputPath) {
    const writtenPath = await writeSiteAvailabilityReport(report, outputPath);
    console.log(`Wrote site availability report to ${writtenPath}`);
  }

  if (!printJson) {
    return;
  }
  console.log('');
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
