import * as fs from 'fs';
import * as path from 'path';
import {
  getAvailabilityReportsDir,
  type AvailabilitySnapshot,
} from './availability-snapshots';

const LEGACY_AVAILABILITY_DIR = path.resolve(process.cwd(), 'camp sites', 'availability');

export type BookingTargetFit = 'exact' | 'future' | 'blocked';

export type BookingTarget = {
  site: string;
  siteId: string;
  detailsUrl: string;
  targetDate: string;
  stayLength: string;
  fit: BookingTargetFit;
  arrivalStatus: string;
  stayWindowStatuses: string[];
  sourceSnapshotPath?: string;
  sourceGeneratedAt: string;
};

export type ArrivalShortlist = {
  generatedAt: string;
  targetDate: string;
  stayLength: string;
  loop: string;
  sourceSnapshotGeneratedAt: string;
  sourceSnapshotPath?: string;
  siteListSource?: string;
  targets: BookingTarget[];
};

function slugifyLoop(loop: string): string {
  return loop.trim().toLowerCase();
}

function slashDateForFile(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid date "${value}". Expected MM/DD/YYYY.`);
  }

  return `${match[3]}-${match[1]}-${match[2]}`;
}

function normalizeTimestamp(value: string): string {
  return value.replace(/[:.]/g, '-');
}

function addDays(value: string, days: number): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid date "${value}". Expected MM/DD/YYYY.`);
  }

  const date = new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
  date.setUTCDate(date.getUTCDate() + days);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

function determineFit(arrivalStatus: string): BookingTargetFit {
  if (arrivalStatus === 'A') {
    return 'exact';
  }
  if (arrivalStatus === 'a') {
    return 'future';
  }
  return 'blocked';
}

function buildBookingTarget(
  result: AvailabilitySnapshot['results'][number],
  targetDate: string,
  stayLength: string,
  sourceGeneratedAt: string,
  sourceSnapshotPath?: string,
): BookingTarget {
  const arrivalDay = result.arrivalStatuses?.find((day) => day.date === targetDate);
  const stayLengthNumber = Math.max(1, parseInt(stayLength, 10) || 1);
  const stayWindowDates = Array.from({ length: stayLengthNumber }, (_, index) => addDays(targetDate, index));
  const dayStatusByDate = new Map(result.days.map((day) => [day.date, day.status]));
  const stayWindowStatuses = stayWindowDates.map((date) => dayStatusByDate.get(date) ?? '-');
  const arrivalStatus = arrivalDay?.status ?? '?';

  return {
    site: result.site,
    siteId: result.siteId,
    detailsUrl: result.detailsUrl,
    targetDate,
    stayLength,
    fit: determineFit(arrivalStatus),
    arrivalStatus,
    stayWindowStatuses,
    ...(sourceSnapshotPath ? { sourceSnapshotPath } : {}),
    sourceGeneratedAt,
  };
}

export function listExactFitTargets(shortlist: ArrivalShortlist): BookingTarget[] {
  return shortlist.targets.filter((target) => target.fit === 'exact');
}

export function listFutureOnlyTargets(shortlist: ArrivalShortlist): BookingTarget[] {
  return shortlist.targets.filter((target) => target.fit === 'future');
}

export function listBlockedTargets(shortlist: ArrivalShortlist): BookingTarget[] {
  return shortlist.targets.filter((target) => target.fit === 'blocked');
}

export function classifyArrivalSnapshot(
  snapshot: AvailabilitySnapshot,
  targetDate: string,
  sourceSnapshotPath?: string,
): ArrivalShortlist {
  return {
    generatedAt: new Date().toISOString(),
    targetDate,
    stayLength: snapshot.stayLength,
    loop: snapshot.loop,
    sourceSnapshotGeneratedAt: snapshot.generatedAt,
    ...(sourceSnapshotPath ? { sourceSnapshotPath } : {}),
    ...(snapshot.siteListSource ? { siteListSource: snapshot.siteListSource } : {}),
    targets: snapshot.results.map((result) =>
      buildBookingTarget(result, targetDate, snapshot.stayLength, snapshot.generatedAt, sourceSnapshotPath)),
  };
}

export function buildArrivalShortlistBasePath(shortlist: ArrivalShortlist): string {
  const baseDir = getAvailabilityReportsDir();
  const filename = `arrival-shortlist-${slugifyLoop(shortlist.loop)}-${slashDateForFile(shortlist.targetDate)}-${shortlist.stayLength}n-${normalizeTimestamp(shortlist.generatedAt)}`;
  return path.join(baseDir, filename);
}

export function writeArrivalShortlistJson(shortlist: ArrivalShortlist, outputPath?: string): string {
  const resolvedPath = outputPath
    ? path.resolve(outputPath)
    : `${buildArrivalShortlistBasePath(shortlist)}.json`;
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(shortlist, null, 2)}\n`, 'utf-8');
  return resolvedPath;
}

export function loadArrivalShortlist(shortlistPath: string): ArrivalShortlist {
  const resolvedPath = path.resolve(shortlistPath);
  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = JSON.parse(content) as Partial<ArrivalShortlist>;
  if (
    !parsed.loop ||
    !parsed.stayLength ||
    !parsed.targetDate ||
    !Array.isArray(parsed.targets)
  ) {
    throw new Error(`File is not a valid arrival shortlist: ${resolvedPath}`);
  }

  return {
    generatedAt: parsed.generatedAt ?? parsed.sourceSnapshotGeneratedAt ?? '',
    targetDate: parsed.targetDate,
    stayLength: parsed.stayLength,
    loop: parsed.loop,
    sourceSnapshotGeneratedAt: parsed.sourceSnapshotGeneratedAt ?? '',
    ...(parsed.sourceSnapshotPath ? { sourceSnapshotPath: parsed.sourceSnapshotPath } : {}),
    ...(parsed.siteListSource ? { siteListSource: parsed.siteListSource } : {}),
    targets: parsed.targets as BookingTarget[],
  };
}

function isDateInShortlist(shortlist: ArrivalShortlist, targetDate: string): boolean {
  return shortlist.targetDate === targetDate;
}

export function findMatchingArrivalShortlists(options: {
  loop?: string;
  stayLength?: string;
  targetDate?: string;
  siteListSource?: string;
  reportsDir?: string;
}): Array<{ shortlistPath: string; shortlist: ArrivalShortlist }> {
  const reportsDirs = options.reportsDir
    ? [path.resolve(options.reportsDir)]
    : [getAvailabilityReportsDir(), LEGACY_AVAILABILITY_DIR]
      .map((dir) => path.resolve(dir))
      .filter((dir, index, values) => values.indexOf(dir) === index);

  return reportsDirs
    .filter((reportsDir) => fs.existsSync(reportsDir))
    .flatMap((reportsDir) => fs.readdirSync(reportsDir)
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => path.join(reportsDir, entry)))
    .map((shortlistPath) => {
      try {
        return { shortlistPath, shortlist: loadArrivalShortlist(shortlistPath) };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { shortlistPath: string; shortlist: ArrivalShortlist } => entry !== null)
    .filter(({ shortlist }) => {
      if (options.loop && shortlist.loop.toUpperCase() !== options.loop.toUpperCase()) {
        return false;
      }
      if (options.stayLength && shortlist.stayLength !== options.stayLength) {
        return false;
      }
      if (options.siteListSource && shortlist.siteListSource !== options.siteListSource) {
        return false;
      }
      if (options.targetDate && !isDateInShortlist(shortlist, options.targetDate)) {
        return false;
      }
      return true;
    })
    .sort((left, right) =>
      new Date(right.shortlist.generatedAt).getTime() - new Date(left.shortlist.generatedAt).getTime());
}

export function loadLatestArrivalShortlist(options: {
  loop?: string;
  stayLength?: string;
  targetDate?: string;
  siteListSource?: string;
  reportsDir?: string;
}): { shortlistPath: string; shortlist: ArrivalShortlist } | null {
  return findMatchingArrivalShortlists(options)[0] ?? null;
}

export function buildArrivalShortlistMarkdown(shortlist: ArrivalShortlist): string {
  const exactFitSites = listExactFitTargets(shortlist);
  const futureOnlySites = listFutureOnlyTargets(shortlist);
  const blockedSites = listBlockedTargets(shortlist);
  const lines: string[] = [
    '# Arrival Shortlist',
    '',
    `- Generated at: ${shortlist.generatedAt}`,
    `- Target date: ${shortlist.targetDate}`,
    `- Stay length: ${shortlist.stayLength}`,
    `- Loop: ${shortlist.loop}`,
    `- Source snapshot generated at: ${shortlist.sourceSnapshotGeneratedAt}`,
  ];

  if (shortlist.siteListSource) {
    lines.push(`- Site list source: ${shortlist.siteListSource}`);
  }
  if (shortlist.sourceSnapshotPath) {
    lines.push(`- Source snapshot path: ${shortlist.sourceSnapshotPath}`);
  }

  lines.push('');
  lines.push('## Exact Fit Sites');
  lines.push('');
  if (exactFitSites.length === 0) {
    lines.push('_None_');
  } else {
    for (const site of exactFitSites) {
      lines.push(`- ${site.site}: status=${site.arrivalStatus}, siteId=${site.siteId}, window=${site.stayWindowStatuses.join(' ')}`);
    }
  }

  lines.push('');
  lines.push('## Future-Only Sites');
  lines.push('');
  if (futureOnlySites.length === 0) {
    lines.push('_None_');
  } else {
    for (const site of futureOnlySites) {
      lines.push(`- ${site.site}: status=${site.arrivalStatus}, siteId=${site.siteId}, window=${site.stayWindowStatuses.join(' ')}`);
    }
  }

  lines.push('');
  lines.push('## Blocked Sites');
  lines.push('');
  lines.push(`- Count: ${blockedSites.length}`);

  return `${lines.join('\n')}\n`;
}

export function writeArrivalShortlistMarkdown(shortlist: ArrivalShortlist, outputPath?: string): string {
  const resolvedPath = outputPath
    ? path.resolve(outputPath)
    : `${buildArrivalShortlistBasePath(shortlist)}.md`;
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, buildArrivalShortlistMarkdown(shortlist), 'utf-8');
  return resolvedPath;
}
