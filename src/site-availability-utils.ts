import { writeFile } from 'fs/promises';
import { dirname, extname, resolve } from 'path';
import { mkdir } from 'fs/promises';
import type { SiteCalendarResult } from './site-calendar';
import type { AvailabilitySnapshot } from './availability-snapshots';

const WEEKDAY_LABELS = ['Su', 'M', 'Tu', 'W', 'Th', 'F', 'Sa'] as const;

function formatRanges(result: SiteCalendarResult): string {
  if (result.availableRanges.length === 0) {
    return 'none';
  }

  return result.availableRanges
    .map((range) => `${range.startDate} -> ${range.endDate} (${range.nights} night${range.nights === 1 ? '' : 's'})`)
    .join('; ');
}

function formatFutureRanges(result: SiteCalendarResult): string {
  if (result.futureAvailableRanges.length === 0) {
    return 'none';
  }

  return result.futureAvailableRanges
    .map((range) => `${range.startDate} -> ${range.endDate} (${range.nights} night${range.nights === 1 ? '' : 's'})`)
    .join('; ');
}

function formatArrivalRanges(ranges: SiteCalendarResult['availableArrivalRanges']): string {
  if (!ranges || ranges.length === 0) {
    return 'none';
  }

  return ranges
    .map((range) => `${range.startDate} -> ${range.endDate} (${range.nights} arrival date${range.nights === 1 ? '' : 's'})`)
    .join('; ');
}

function parseSlashDate(value: string): Date {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid date "${value}". Expected MM/DD/YYYY.`);
  }

  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatSlashDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

function buildDateRange(dateFrom: string, dateTo: string): string[] {
  const start = parseSlashDate(dateFrom);
  const end = parseSlashDate(dateTo);
  const dates: string[] = [];

  for (let current = new Date(start); current.getTime() <= end.getTime(); current.setUTCDate(current.getUTCDate() + 1)) {
    dates.push(formatSlashDate(current));
  }

  return dates;
}

function formatMatrixHeaderCell(value: string): string {
  const date = parseSlashDate(value);
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const weekday = WEEKDAY_LABELS[date.getUTCDay()] ?? '?';
  return `${month}/${day} ${weekday}`;
}

function padMatrixCell(value: string, width: number): string {
  const trimmed = value.trim();
  const totalPadding = Math.max(0, width - trimmed.length);
  const leftPadding = Math.floor(totalPadding / 2);
  const rightPadding = totalPadding - leftPadding;
  return `${' '.repeat(leftPadding)}${trimmed}${' '.repeat(rightPadding)}`;
}

export function resolveArrivalSweepEndDate(dateFrom: string, dateTo: string | undefined, arrivalSweep: boolean): string | undefined {
  if (!arrivalSweep) {
    return undefined;
  }

  return dateTo ?? dateFrom;
}

export function formatSiteCalendarResult(result: SiteCalendarResult): string[] {
  const lines = [
    `${result.site} (${result.loop}) | siteId=${result.siteId} | pages=${result.pagesFetched}`,
    `  seedDateBookableNow: ${result.seedDateBookableNow ? 'yes' : 'no'}`,
    `  maxReservationWindowDate: ${result.maxReservationWindowDate ?? '-'}`,
    `  firstVisibleDate: ${result.firstVisibleDate ?? '-'}`,
    `  lastVisibleDate: ${result.lastVisibleDate ?? '-'}`,
    `  firstAvailableDate: ${result.firstAvailableDate ?? '-'}`,
    `  firstFutureAvailableDate: ${result.firstFutureAvailableDate ?? '-'}`,
    `  maxConsecutiveNights: ${result.maxConsecutiveNights}`,
    `  maxFutureConsecutiveNights: ${result.maxFutureConsecutiveNights}`,
    `  availableRanges: ${formatRanges(result)}`,
    `  futureAvailableRanges: ${formatFutureRanges(result)}`,
  ];

  if (result.arrivalStatuses) {
    lines.push(`  firstAvailableArrivalDate: ${result.firstAvailableArrivalDate ?? '-'}`);
    lines.push(`  firstFutureAvailableArrivalDate: ${result.firstFutureAvailableArrivalDate ?? '-'}`);
    lines.push(`  maxConsecutiveAvailableArrivals: ${result.maxConsecutiveAvailableArrivals ?? 0}`);
    lines.push(`  maxConsecutiveFutureAvailableArrivals: ${result.maxConsecutiveFutureAvailableArrivals ?? 0}`);
    lines.push(`  availableArrivalRanges: ${formatArrivalRanges(result.availableArrivalRanges)}`);
    lines.push(`  futureAvailableArrivalRanges: ${formatArrivalRanges(result.futureAvailableArrivalRanges)}`);
  }

  return lines;
}

export function buildArrivalStatusMatrix(report: AvailabilitySnapshot): string | null {
  const dateTo = report.dateTo ?? report.seedDate;
  const dates = buildDateRange(report.seedDate, dateTo);
  const rows = report.results
    .filter((result) => result.arrivalStatuses && result.arrivalStatuses.length > 0);

  if (rows.length === 0) {
    return null;
  }

  const siteWidth = Math.max(4, ...rows.map((result) => result.site.length));
  const dayHeaders = dates.map(formatMatrixHeaderCell);
  const dayWidth = Math.max(...dayHeaders.map((header) => header.length), 3);

  const header = [
    'Site'.padEnd(siteWidth),
    ...dayHeaders.map((headerCell) => padMatrixCell(headerCell, dayWidth)),
  ].join(' | ');

  const separator = [
    '-'.repeat(siteWidth),
    ...dayHeaders.map(() => '-'.repeat(dayWidth)),
  ].join('-+-');

  const lines = [header, separator];

  for (const result of rows) {
    const arrivalStatusByDate = new Map(
      (result.arrivalStatuses ?? []).map((day) => [day.date, day.status]),
    );
    const cells = dates.map((date) => padMatrixCell(arrivalStatusByDate.get(date) ?? '-', dayWidth));
    lines.push([result.site.padEnd(siteWidth), ...cells].join(' | '));
  }

  return lines.join('\n');
}

export function buildStayWindowStatusMatrix(report: AvailabilitySnapshot): string | null {
  const dateTo = report.dateTo ?? report.seedDate;
  const dates = buildDateRange(report.seedDate, dateTo);
  const rows = report.results
    .filter((result) => result.days && result.days.length > 0);

  if (rows.length === 0) {
    return null;
  }

  const siteWidth = Math.max(4, ...rows.map((result) => result.site.length));
  const dayHeaders = dates.map(formatMatrixHeaderCell);
  const dayWidth = Math.max(...dayHeaders.map((header) => header.length), 3);

  const header = [
    'Site'.padEnd(siteWidth),
    ...dayHeaders.map((headerCell) => padMatrixCell(headerCell, dayWidth)),
  ].join(' | ');

  const separator = [
    '-'.repeat(siteWidth),
    ...dayHeaders.map(() => '-'.repeat(dayWidth)),
  ].join('-+-');

  const lines = [header, separator];

  for (const result of rows) {
    const dayStatusByDate = new Map(
      result.days.map((day) => [day.date, day.status]),
    );
    const cells = dates.map((date) => padMatrixCell(dayStatusByDate.get(date) ?? '-', dayWidth));
    lines.push([result.site.padEnd(siteWidth), ...cells].join(' | '));
  }

  return lines.join('\n');
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

export function buildSiteAvailabilityMarkdownReport(report: AvailabilitySnapshot): string {
  const lines: string[] = [
    '# Site Availability Report',
    '',
    `- Searched at: ${report.generatedAt}`,
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

  const arrivalMatrix = buildArrivalStatusMatrix(report);
  if (arrivalMatrix) {
    lines.push('- Arrival sweep: enabled');
  }

  lines.push('');

  if (arrivalMatrix) {
    lines.push('## Arrival Status Matrix');
    lines.push('');
    lines.push('```text');
    lines.push(arrivalMatrix);
    lines.push('```');
    lines.push('');
  }

  for (const result of report.results) {
    lines.push(`## ${result.site}`);
    lines.push('');
    lines.push(`- Site ID: ${result.siteId}`);
    lines.push(`- Pages fetched: ${result.pagesFetched}`);
    lines.push(`- First available date: ${result.firstAvailableDate ?? '-'}`);
    lines.push(`- First future-available date: ${result.firstFutureAvailableDate ?? '-'}`);
    lines.push(`- Max consecutive nights: ${result.maxConsecutiveNights}`);
    lines.push(`- Max future consecutive nights: ${result.maxFutureConsecutiveNights}`);
    lines.push(`- First visible date: ${result.firstVisibleDate ?? '-'}`);
    lines.push(`- Last visible date: ${result.lastVisibleDate ?? '-'}`);
    lines.push(`- Booking window open now for seed date: ${result.seedDateBookableNow ? 'yes' : 'no'}`);
    lines.push(`- Max reservation window date: ${result.maxReservationWindowDate ?? '-'}`);
    lines.push(`- Available ranges: ${formatRanges(result)}`);
    lines.push(`- Future-available ranges: ${formatFutureRanges(result)}`);
    if (result.arrivalStatuses) {
      lines.push(`- First available arrival date: ${result.firstAvailableArrivalDate ?? '-'}`);
      lines.push(`- First future-available arrival date: ${result.firstFutureAvailableArrivalDate ?? '-'}`);
      lines.push(`- Max consecutive available arrival dates: ${result.maxConsecutiveAvailableArrivals ?? 0}`);
      lines.push(`- Max consecutive future-available arrival dates: ${result.maxConsecutiveFutureAvailableArrivals ?? 0}`);
      lines.push(`- Available arrival ranges: ${formatArrivalRanges(result.availableArrivalRanges)}`);
      lines.push(`- Future-available arrival ranges: ${formatArrivalRanges(result.futureAvailableArrivalRanges)}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

export function buildSiteAvailabilityCsvReport(report: AvailabilitySnapshot): string {
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
    'firstFutureAvailableDate',
    'maxConsecutiveNights',
    'maxFutureConsecutiveNights',
    'availableRanges',
    'futureAvailableRanges',
    'firstAvailableArrivalDate',
    'firstFutureAvailableArrivalDate',
    'maxConsecutiveAvailableArrivals',
    'maxConsecutiveFutureAvailableArrivals',
    'availableArrivalRanges',
    'futureAvailableArrivalRanges',
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
    result.firstFutureAvailableDate ?? '',
    String(result.maxConsecutiveNights),
    String(result.maxFutureConsecutiveNights),
    formatRanges(result),
    formatFutureRanges(result),
    result.firstAvailableArrivalDate ?? '',
    result.firstFutureAvailableArrivalDate ?? '',
    String(result.maxConsecutiveAvailableArrivals ?? 0),
    String(result.maxConsecutiveFutureAvailableArrivals ?? 0),
    formatArrivalRanges(result.availableArrivalRanges),
    formatArrivalRanges(result.futureAvailableArrivalRanges),
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
    .join('\n');
}

export async function writeSiteAvailabilityReport(report: AvailabilitySnapshot, outputPath: string): Promise<string> {
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
