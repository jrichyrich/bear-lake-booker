import { parseArgs } from 'util';
import { loadSiteList } from './site-lists';
import {
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

export type SiteAvailabilityRunOptions = {
  dateFrom: string;
  dateTo?: string;
  stayLength?: string;
  loop?: string;
  explicitSites?: string[];
  siteListNameOrPath?: string;
  concurrency?: number;
  outputPath?: string;
  arrivalSweep?: boolean;
  arrivalMatrix?: boolean;
  printJson?: boolean;
  arrivalSweepConcurrency?: number;
};

export type SiteAvailabilityRunResult = {
  report: AvailabilitySnapshot;
  snapshotPath: string;
  outputPath?: string;
  arrivalMatrix?: string | null;
};

function printHelp(): void {
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
  --arrivalSweepConcurrency <n>  Parallel arrival-date probes per site when using --arrivalSweep [default: 3]
  --out <path>                 Write an additional report file (.md, .csv, or .json)
  --arrivalSweep               Probe each arrival date in the window for this stay length
  --arrivalMatrix              Print a site-by-site arrival-status matrix (requires --arrivalSweep)
  --json                       Print machine-readable JSON after the console summary
  -h, --help                   Show help
  `);
}

export async function runSiteAvailability(options: SiteAvailabilityRunOptions): Promise<SiteAvailabilityRunResult> {
  const dateFrom = options.dateFrom;
  const dateTo = options.dateTo;
  const stayLength = options.stayLength ?? '1';
  const loop = options.loop ?? 'BIRCH';
  const explicitSites = (options.explicitSites ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean);
  const loadedSiteList = explicitSites.length === 0 && options.siteListNameOrPath
    ? loadSiteList(options.siteListNameOrPath)
    : null;
  const requestedSites = explicitSites.length > 0 ? explicitSites : loadedSiteList?.siteIds ?? [];
  const siteListSource = loadedSiteList?.sourcePath;
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
  const outputPath = options.outputPath;
  const arrivalSweep = options.arrivalSweep === true;
  const arrivalMatrix = options.arrivalMatrix === true;
  const printJson = options.printJson === true;
  const arrivalSweepConcurrency = Math.max(1, Math.floor(options.arrivalSweepConcurrency ?? 3));

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
    console.log(`Arrival sweep concurrency: ${arrivalSweepConcurrency}`);
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

      const sweep = await fetchSiteArrivalSweep(
        siteRecord,
        dateFrom,
        stayLength,
        arrivalSweepEndDate,
        arrivalSweepConcurrency,
      );
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

  let arrivalMatrixOutput: string | null | undefined;
  if (arrivalMatrix) {
    const matrix = buildArrivalStatusMatrix(report);
    arrivalMatrixOutput = matrix;
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

  if (printJson) {
    console.log('');
    console.log(JSON.stringify(report, null, 2));
  }

  const result: SiteAvailabilityRunResult = {
    report,
    snapshotPath,
  };
  if (outputPath) {
    result.outputPath = outputPath;
  }
  if (arrivalSweep) {
    result.arrivalMatrix = arrivalMatrixOutput ?? null;
  }
  return result;
}

export async function runSiteAvailabilityCliArgs(args = process.argv.slice(2)): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      dateFrom: { type: 'string' },
      dateTo: { type: 'string' },
      length: { type: 'string', short: 'l', default: '1' },
      loop: { type: 'string', short: 'o', default: 'BIRCH' },
      sites: { type: 'string' },
      siteList: { type: 'string' },
      concurrency: { type: 'string', default: '4' },
      arrivalSweepConcurrency: { type: 'string', default: '3' },
      out: { type: 'string' },
      arrivalSweep: { type: 'boolean', default: false },
      arrivalMatrix: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help || !values.dateFrom) {
    printHelp();
    return values.help ? 0 : 1;
  }

  try {
    const options: SiteAvailabilityRunOptions = {
      dateFrom: values.dateFrom as string,
      stayLength: values.length as string,
      loop: values.loop as string,
      explicitSites: typeof values.sites === 'string'
        ? values.sites.split(',').map((value) => value.trim().toUpperCase()).filter(Boolean)
        : [],
      concurrency: Math.max(1, parseInt((values.concurrency as string) ?? '4', 10) || 4),
      arrivalSweepConcurrency: Math.max(1, parseInt((values.arrivalSweepConcurrency as string) ?? '3', 10) || 3),
      arrivalSweep: values.arrivalSweep === true,
      arrivalMatrix: values.arrivalMatrix === true,
      printJson: values.json === true,
    };
    if (typeof values.dateTo === 'string') {
      options.dateTo = values.dateTo;
    }
    if (typeof values.siteList === 'string') {
      options.siteListNameOrPath = values.siteList;
    }
    if (typeof values.out === 'string') {
      options.outputPath = values.out;
    }
    await runSiteAvailability(options);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (require.main === module) {
  void runSiteAvailabilityCliArgs().then((code) => {
    process.exitCode = code;
  });
}
