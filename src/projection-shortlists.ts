import * as fs from 'fs';
import * as path from 'path';
import type { SiteCalendarResult } from './site-calendar';

export type ProjectionSiteRecord = {
  site: string;
  siteId: string;
  detailsUrl: string;
  selectedStatus: string;
  projectedFutureNights: number;
  projectedRangeStart: string | undefined;
  projectedRangeEnd: string | undefined;
};

export type ProjectionShortlist = {
  generatedAt: string;
  launchDate: string;
  targetDate: string;
  stayLength: string;
  loop: string;
  siteListSource?: string;
  exactFitSites: ProjectionSiteRecord[];
  partialFitSites: ProjectionSiteRecord[];
  excludedSites: ProjectionSiteRecord[];
};

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

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  const date = parseSlashDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatSlashDate(date);
}

export function formatLocalLaunchDate(now: Date): string {
  return formatIsoDate(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function computeExpectedWindowEdgeDate(now: Date): string {
  const edge = new Date(now.getFullYear(), now.getMonth() + 4, now.getDate());
  return formatSlashDate(new Date(Date.UTC(edge.getFullYear(), edge.getMonth(), edge.getDate())));
}

export function buildProjectionEndDate(targetDate: string, stayLength: string): string {
  const nights = Math.max(1, parseInt(stayLength, 10) || 1);
  return addDays(targetDate, nights - 1);
}

function buildProjectedFollowOnRange(result: SiteCalendarResult, targetDate: string): {
  nights: number;
  startDate?: string;
  endDate?: string;
} {
  const daysByDate = new Map(result.days.map((day) => [day.date, day]));
  const startDate = addDays(targetDate, 1);
  let currentDate = startDate;
  let nights = 0;
  let endDate: string | undefined;

  for (;;) {
    const day = daysByDate.get(currentDate);
    if (!day || (!day.reservable && !day.futureReservable)) {
      break;
    }

    nights += 1;
    endDate = currentDate;
    currentDate = addDays(currentDate, 1);
  }

  return nights > 0
    ? {
        nights,
        startDate,
        ...(endDate ? { endDate } : {}),
      }
    : { nights: 0 };
}

function buildProjectionSiteRecord(result: SiteCalendarResult, targetDate: string): ProjectionSiteRecord {
  const selectedDay = result.days.find((day) => day.date === targetDate);
  const projectedFollowOnRange = buildProjectedFollowOnRange(result, targetDate);

  return {
    site: result.site,
    siteId: result.siteId,
    detailsUrl: result.detailsUrl,
    selectedStatus: selectedDay?.status ?? '?',
    projectedFutureNights: projectedFollowOnRange.nights,
    projectedRangeStart: projectedFollowOnRange.startDate,
    projectedRangeEnd: projectedFollowOnRange.endDate,
  };
}

export function classifyProjectionResults(
  results: SiteCalendarResult[],
  targetDate: string,
  stayLength: string,
): ProjectionShortlist {
  const requiredFutureNights = Math.max(0, (parseInt(stayLength, 10) || 1) - 1);
  const exactFitSites: ProjectionSiteRecord[] = [];
  const partialFitSites: ProjectionSiteRecord[] = [];
  const excludedSites: ProjectionSiteRecord[] = [];

  for (const result of results) {
    const record = buildProjectionSiteRecord(result, targetDate);
    if (record.selectedStatus === 'A' && record.projectedFutureNights >= requiredFutureNights) {
      exactFitSites.push(record);
      continue;
    }

    if (record.selectedStatus === 'A') {
      partialFitSites.push(record);
      continue;
    }

    excludedSites.push(record);
  }

  return {
    generatedAt: new Date().toISOString(),
    launchDate: '',
    targetDate,
    stayLength,
    loop: results[0]?.loop ?? '',
    exactFitSites,
    partialFitSites,
    excludedSites,
  };
}

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

export function buildProjectionShortlistBasePath(shortlist: ProjectionShortlist): string {
  const baseDir = path.resolve(process.cwd(), 'camp sites', 'availability');
  const filename = `shortlist-${slugifyLoop(shortlist.loop)}-${slashDateForFile(shortlist.targetDate)}-${shortlist.stayLength}n-${shortlist.launchDate}`;
  return path.join(baseDir, filename);
}

export function writeProjectionShortlistJson(shortlist: ProjectionShortlist, outputPath?: string): string {
  const resolvedPath = outputPath
    ? path.resolve(outputPath)
    : `${buildProjectionShortlistBasePath(shortlist)}.json`;
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(shortlist, null, 2)}\n`, 'utf-8');
  return resolvedPath;
}

export function buildProjectionShortlistMarkdown(shortlist: ProjectionShortlist): string {
  const lines: string[] = [
    '# Release-Morning Projection Shortlist',
    '',
    `- Generated at: ${shortlist.generatedAt}`,
    `- Launch date: ${shortlist.launchDate}`,
    `- Target date: ${shortlist.targetDate}`,
    `- Stay length: ${shortlist.stayLength}`,
    `- Loop: ${shortlist.loop}`,
  ];

  if (shortlist.siteListSource) {
    lines.push(`- Site list source: ${shortlist.siteListSource}`);
  }

  lines.push('');
  lines.push('## Exact Fit Sites');
  lines.push('');
  if (shortlist.exactFitSites.length === 0) {
    lines.push('_None_');
  } else {
    for (const site of shortlist.exactFitSites) {
      lines.push(`- ${site.site}: selected=${site.selectedStatus}, projectedFutureNights=${site.projectedFutureNights}, projectedRange=${site.projectedRangeStart ?? '-'} -> ${site.projectedRangeEnd ?? '-'}`);
    }
  }

  lines.push('');
  lines.push('## Partial Fit Sites');
  lines.push('');
  if (shortlist.partialFitSites.length === 0) {
    lines.push('_None_');
  } else {
    for (const site of shortlist.partialFitSites) {
      lines.push(`- ${site.site}: selected=${site.selectedStatus}, projectedFutureNights=${site.projectedFutureNights}, projectedRange=${site.projectedRangeStart ?? '-'} -> ${site.projectedRangeEnd ?? '-'}`);
    }
  }

  if (shortlist.excludedSites.length > 0) {
    lines.push('');
    lines.push('## Excluded Sites');
    lines.push('');
    lines.push(`- Count: ${shortlist.excludedSites.length}`);
  }

  return `${lines.join('\n')}\n`;
}

export function writeProjectionShortlistMarkdown(shortlist: ProjectionShortlist, outputPath?: string): string {
  const resolvedPath = outputPath
    ? path.resolve(outputPath)
    : `${buildProjectionShortlistBasePath(shortlist)}.md`;
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, buildProjectionShortlistMarkdown(shortlist), 'utf-8');
  return resolvedPath;
}
