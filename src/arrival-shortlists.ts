import * as fs from 'fs';
import * as path from 'path';
import type { AvailabilitySnapshot } from './availability-snapshots';

export type ArrivalShortlistSiteRecord = {
  site: string;
  siteId: string;
  detailsUrl: string;
  arrivalDate: string;
  status: string;
};

export type ArrivalShortlist = {
  generatedAt: string;
  targetDate: string;
  stayLength: string;
  loop: string;
  sourceSnapshotGeneratedAt: string;
  sourceSnapshotPath?: string;
  siteListSource?: string;
  exactFitSites: ArrivalShortlistSiteRecord[];
  futureOnlySites: ArrivalShortlistSiteRecord[];
  blockedSites: ArrivalShortlistSiteRecord[];
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

function buildShortlistRecord(
  result: AvailabilitySnapshot['results'][number],
  targetDate: string,
): ArrivalShortlistSiteRecord {
  const arrivalDay = result.arrivalStatuses?.find((day) => day.date === targetDate);

  return {
    site: result.site,
    siteId: result.siteId,
    detailsUrl: result.detailsUrl,
    arrivalDate: targetDate,
    status: arrivalDay?.status ?? '?',
  };
}

export function classifyArrivalSnapshot(
  snapshot: AvailabilitySnapshot,
  targetDate: string,
  sourceSnapshotPath?: string,
): ArrivalShortlist {
  const exactFitSites: ArrivalShortlistSiteRecord[] = [];
  const futureOnlySites: ArrivalShortlistSiteRecord[] = [];
  const blockedSites: ArrivalShortlistSiteRecord[] = [];

  for (const result of snapshot.results) {
    const record = buildShortlistRecord(result, targetDate);
    if (record.status === 'A') {
      exactFitSites.push(record);
      continue;
    }
    if (record.status === 'a') {
      futureOnlySites.push(record);
      continue;
    }
    blockedSites.push(record);
  }

  return {
    generatedAt: new Date().toISOString(),
    targetDate,
    stayLength: snapshot.stayLength,
    loop: snapshot.loop,
    sourceSnapshotGeneratedAt: snapshot.generatedAt,
    ...(sourceSnapshotPath ? { sourceSnapshotPath } : {}),
    ...(snapshot.siteListSource ? { siteListSource: snapshot.siteListSource } : {}),
    exactFitSites,
    futureOnlySites,
    blockedSites,
  };
}

export function buildArrivalShortlistBasePath(shortlist: ArrivalShortlist): string {
  const baseDir = path.resolve(process.cwd(), 'camp sites', 'availability');
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

export function buildArrivalShortlistMarkdown(shortlist: ArrivalShortlist): string {
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
  if (shortlist.exactFitSites.length === 0) {
    lines.push('_None_');
  } else {
    for (const site of shortlist.exactFitSites) {
      lines.push(`- ${site.site}: status=${site.status}, siteId=${site.siteId}`);
    }
  }

  lines.push('');
  lines.push('## Future-Only Sites');
  lines.push('');
  if (shortlist.futureOnlySites.length === 0) {
    lines.push('_None_');
  } else {
    for (const site of shortlist.futureOnlySites) {
      lines.push(`- ${site.site}: status=${site.status}, siteId=${site.siteId}`);
    }
  }

  lines.push('');
  lines.push('## Blocked Sites');
  lines.push('');
  lines.push(`- Count: ${shortlist.blockedSites.length}`);

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
