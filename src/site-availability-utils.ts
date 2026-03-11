import { writeFile } from 'fs/promises';
import { dirname, extname, resolve } from 'path';
import { mkdir } from 'fs/promises';
import type { SiteCalendarResult } from './site-calendar';

export type SiteAvailabilityReport = {
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

export function formatSiteCalendarResult(result: SiteCalendarResult): string[] {
  return [
    `${result.site} (${result.loop}) | siteId=${result.siteId} | pages=${result.pagesFetched}`,
    `  seedDateBookableNow: ${result.seedDateBookableNow ? 'yes' : 'no'}`,
    `  maxReservationWindowDate: ${result.maxReservationWindowDate ?? '-'}`,
    `  firstVisibleDate: ${result.firstVisibleDate ?? '-'}`,
    `  lastVisibleDate: ${result.lastVisibleDate ?? '-'}`,
    `  firstAvailableDate: ${result.firstAvailableDate ?? '-'}`,
    `  maxConsecutiveNights: ${result.maxConsecutiveNights}`,
    `  availableRanges: ${formatRanges(result)}`,
  ];
}

export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency));
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= values.length) {
        return;
      }

      results[currentIndex] = await mapper(values[currentIndex]!, currentIndex);
    }
  }

  const workerCount = Math.min(limit, values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function buildSiteAvailabilityMarkdownReport(report: SiteAvailabilityReport): string {
  const lines: string[] = [
    '# Site Availability Report',
    '',
    `- Searched at: ${report.searchedAt}`,
    `- Loop: ${report.loop}`,
    `- Stay length: ${report.stayLength}`,
    `- Seed date: ${report.seedDate}`,
    `- Requested sites: ${report.requestedSites.length}`,
  ];

  if (report.dateTo) {
    lines.push(`- Reported through: ${report.dateTo}`);
  }
  if (report.siteListSource) {
    lines.push(`- Site list source: ${report.siteListSource}`);
  }
  if (report.missingSites.length > 0) {
    lines.push(`- Missing sites: ${report.missingSites.join(', ')}`);
  }

  lines.push('');

  for (const result of report.results) {
    lines.push(`## ${result.site}`);
    lines.push('');
    lines.push(`- Site ID: ${result.siteId}`);
    lines.push(`- Pages fetched: ${result.pagesFetched}`);
    lines.push(`- First available date: ${result.firstAvailableDate ?? '-'}`);
    lines.push(`- Max consecutive nights: ${result.maxConsecutiveNights}`);
    lines.push(`- First visible date: ${result.firstVisibleDate ?? '-'}`);
    lines.push(`- Last visible date: ${result.lastVisibleDate ?? '-'}`);
    lines.push(`- Booking window open now for seed date: ${result.seedDateBookableNow ? 'yes' : 'no'}`);
    lines.push(`- Max reservation window date: ${result.maxReservationWindowDate ?? '-'}`);
    lines.push(`- Available ranges: ${formatRanges(result)}`);
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

export function buildSiteAvailabilityCsvReport(report: SiteAvailabilityReport): string {
  const header = [
    'site',
    'loop',
    'siteId',
    'pagesFetched',
    'seedDateBookableNow',
    'maxReservationWindowDate',
    'firstVisibleDate',
    'lastVisibleDate',
    'firstAvailableDate',
    'maxConsecutiveNights',
    'availableRanges',
  ];

  const rows = report.results.map((result) => [
    result.site,
    result.loop,
    result.siteId,
    String(result.pagesFetched),
    result.seedDateBookableNow ? 'yes' : 'no',
    result.maxReservationWindowDate ?? '',
    result.firstVisibleDate ?? '',
    result.lastVisibleDate ?? '',
    result.firstAvailableDate ?? '',
    String(result.maxConsecutiveNights),
    formatRanges(result),
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\n');
}

export async function writeSiteAvailabilityReport(report: SiteAvailabilityReport, outputPath: string): Promise<string> {
  const resolvedPath = resolve(outputPath);
  const extension = extname(resolvedPath).toLowerCase();

  let content: string;
  if (extension === '.json') {
    content = `${JSON.stringify(report, null, 2)}\n`;
  } else if (extension === '.csv') {
    content = `${buildSiteAvailabilityCsvReport(report)}\n`;
  } else {
    content = buildSiteAvailabilityMarkdownReport(report);
  }

  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, content, 'utf8');
  return resolvedPath;
}
