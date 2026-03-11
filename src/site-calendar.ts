import * as cheerio from 'cheerio';
import { PARK_URL } from './config';
import { searchAvailability, type SiteAvailability } from './reserveamerica';
import { isDateBookableNow } from './timer-utils';

const USER_AGENT = 'bear-lake-booker/1.0';
const RESERVABLE_STATUSES = new Set(['A']);

export type SiteCalendarDay = {
  date: string;
  status: string;
  reservable: boolean;
};

export type SiteAvailabilityRange = {
  startDate: string;
  endDate: string;
  nights: number;
};

export type SiteCalendarResult = {
  site: string;
  loop: string;
  siteId: string;
  detailsUrl: string;
  seedDate: string;
  seedDateBookableNow: boolean;
  maxReservationWindowDate?: string;
  pagesFetched: number;
  firstVisibleDate?: string;
  lastVisibleDate?: string;
  firstAvailableDate?: string;
  maxConsecutiveNights: number;
  availableRanges: SiteAvailabilityRange[];
  days: SiteCalendarDay[];
};

export type SiteRecord = {
  site: string;
  loop: string;
  siteId: string;
  detailsUrl: string;
};

type ParsedSiteCalendarPage = {
  site: string;
  loop: string;
  siteId: string;
  detailsUrl: string;
  maxReservationWindowDate?: string;
  nextPagePath?: string;
  days: SiteCalendarDay[];
};

function parseDate(value: string): Date {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid date "${value}". Expected MM/DD/YYYY.`);
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid calendar date "${value}".`);
  }
  return date;
}

function formatDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

function compareDates(left: string, right: string): number {
  return parseDate(left).getTime() - parseDate(right).getTime();
}

function formatUiDateToSlashDate(value: string): string {
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Unable to parse UI date "${value}".`);
  }
  return formatDate(new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())));
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      if (attempt > 0) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
      const response = await fetch(url, options);
      if (response.ok || response.status < 500) {
        return response;
      }
      throw new Error(`Server returned ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error('Fetch failed');
}

function parseStatusValue(cell: cheerio.Cheerio<any>): string {
  const text = cell.text().trim().toUpperCase();
  if (text) {
    return text;
  }

  const classes = (cell.attr('class') || '')
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const statusClass = classes.find((value) => /^[A-Za-z]$/.test(value));
  return statusClass ? statusClass.toUpperCase() : '?';
}

function extractPagingPath(href: string | undefined): string | undefined {
  if (!href) {
    return undefined;
  }
  return href
    .replace(/&amp;/g, '&')
    .trim();
}

export function parseSiteCalendarPage(html: string, fallbackUrl: string): ParsedSiteCalendarPage {
  const $ = cheerio.load(html);
  const siteTitle = $('#sitenamearea .siteTile').text().trim();
  const siteMatch = /Site,\s*Loop:\s*([^,]+),\s*(.+)$/i.exec(siteTitle);
  if (!siteMatch) {
    throw new Error('Site details page did not contain a parsable site/loop header.');
  }

  const site = siteMatch[1]!.trim().toUpperCase();
  const loop = siteMatch[2]!.trim().toUpperCase();
  const siteId = $('#siteId').attr('value')?.trim()
    || new URL(fallbackUrl).searchParams.get('siteId')
    || '';
  if (!siteId) {
    throw new Error(`Unable to determine siteId for ${site}.`);
  }

  const statusCells = $('#calendar .br').first().find('.td.status');
  if (statusCells.length === 0) {
    throw new Error(`Site details page for ${site} did not contain a calendar row.`);
  }

  const days: SiteCalendarDay[] = statusCells.toArray().map((element) => {
    const cell = $(element);
    const autoId = cell.attr('data-auto-id') || '';
    const dateMatch = /mday(\d{4})(\d{2})(\d{2})/.exec(autoId);
    if (!dateMatch) {
      throw new Error(`Calendar cell for ${site} did not contain a parsable data-auto-id.`);
    }
    const [, year, month, day] = dateMatch;
    const date = `${month}/${day}/${year}`;
    const status = parseStatusValue(cell);
    return {
      date,
      status,
      reservable: RESERVABLE_STATUSES.has(status),
    };
  });

  const nextPageHref = $('#nextWeek').attr('href')?.trim();
  const maxReservationWindowDate = $('#dateMaxWindow').attr('value')?.trim() || undefined;
  const nextPagePath = extractPagingPath(nextPageHref);

  return {
    site,
    loop,
    siteId,
    detailsUrl: fallbackUrl,
    ...(maxReservationWindowDate ? { maxReservationWindowDate } : {}),
    ...(nextPagePath ? { nextPagePath } : {}),
    days,
  };
}

export function mergeSiteCalendarPages(pages: ParsedSiteCalendarPage[]): SiteCalendarDay[] {
  const mergedByDate = new Map<string, SiteCalendarDay>();

  for (const page of pages) {
    for (const day of page.days) {
      if (!mergedByDate.has(day.date)) {
        mergedByDate.set(day.date, day);
      }
    }
  }

  return Array.from(mergedByDate.values()).sort((left, right) => compareDates(left.date, right.date));
}

export function buildAvailableRanges(days: SiteCalendarDay[]): SiteAvailabilityRange[] {
  const ranges: SiteAvailabilityRange[] = [];
  let currentRange: SiteAvailabilityRange | null = null;

  for (const day of days) {
    if (!day.reservable) {
      if (currentRange) {
        ranges.push(currentRange);
        currentRange = null;
      }
      continue;
    }

    if (!currentRange) {
      currentRange = {
        startDate: day.date,
        endDate: day.date,
        nights: 1,
      };
      continue;
    }

    const previousEnd = parseDate(currentRange.endDate);
    const nextDate = parseDate(day.date);
    const diffDays = Math.round((nextDate.getTime() - previousEnd.getTime()) / 86_400_000);
    if (diffDays === 1) {
      currentRange.endDate = day.date;
      currentRange.nights += 1;
    } else {
      ranges.push(currentRange);
      currentRange = {
        startDate: day.date,
        endDate: day.date,
        nights: 1,
      };
    }
  }

  if (currentRange) {
    ranges.push(currentRange);
  }

  return ranges;
}

function clipDaysToDateRange(days: SiteCalendarDay[], dateFrom: string, dateTo?: string): SiteCalendarDay[] {
  const startMs = parseDate(dateFrom).getTime();
  const endMs = dateTo ? parseDate(dateTo).getTime() : null;
  return days.filter((day) => {
    const currentMs = parseDate(day.date).getTime();
    if (currentMs < startMs) {
      return false;
    }
    if (endMs !== null && currentMs > endMs) {
      return false;
    }
    return true;
  });
}

function shouldStopPaging(
  currentPage: ParsedSiteCalendarPage,
  mergedDays: SiteCalendarDay[],
  dateTo?: string,
): boolean {
  if (!currentPage.nextPagePath) {
    return true;
  }

  const lastVisibleDate = mergedDays[mergedDays.length - 1]?.date;
  if (!lastVisibleDate) {
    return true;
  }

  if (dateTo && compareDates(lastVisibleDate, dateTo) >= 0) {
    return true;
  }

  if (currentPage.maxReservationWindowDate && compareDates(lastVisibleDate, currentPage.maxReservationWindowDate) >= 0) {
    return true;
  }

  return false;
}

function buildInitialSiteDetailsUrl(siteId: string, dateFrom: string, stayLength: string): string {
  const url = new URL('https://utahstateparks.reserveamerica.com/camping/bear-lake-state-park/r/campsiteDetails.do');
  url.searchParams.set('contractCode', 'UT');
  url.searchParams.set('parkId', '343061');
  url.searchParams.set('siteId', siteId);
  url.searchParams.set('arvdate', dateFrom);
  url.searchParams.set('lengthOfStay', stayLength);
  return url.toString();
}

export async function resolveRequestedSiteRecords(
  dateFrom: string,
  stayLength: string,
  loop: string,
  requestedSites: string[],
): Promise<{ found: SiteRecord[]; missing: string[] }> {
  const fullLoopResult = await searchAvailability({
    date: dateFrom,
    length: stayLength,
    loop,
  });

  const siteMap = new Map<string, SiteAvailability>(
    fullLoopResult.allSites.map((site) => [site.site.toUpperCase(), site]),
  );

  const found: SiteRecord[] = [];
  const missing: string[] = [];

  for (const siteName of requestedSites) {
    const normalized = siteName.trim().toUpperCase();
    const site = siteMap.get(normalized);
    if (!site?.siteId) {
      missing.push(normalized);
      continue;
    }

    found.push({
      site: normalized,
      loop: site.loop.toUpperCase(),
      siteId: site.siteId,
      detailsUrl: site.detailsUrl ?? buildInitialSiteDetailsUrl(site.siteId, dateFrom, stayLength),
    });
  }

  return { found, missing };
}

export async function fetchSiteCalendarAvailability(
  siteRecord: SiteRecord,
  dateFrom: string,
  stayLength: string,
  dateTo?: string,
): Promise<SiteCalendarResult> {
  const visitedPageUrls = new Set<string>();
  const parsedPages: ParsedSiteCalendarPage[] = [];
  let currentUrl = buildInitialSiteDetailsUrl(siteRecord.siteId, dateFrom, stayLength);

  while (currentUrl) {
    if (visitedPageUrls.has(currentUrl)) {
      break;
    }
    visitedPageUrls.add(currentUrl);

    const response = await fetchWithRetry(currentUrl, {
      headers: {
        referer: PARK_URL,
        'user-agent': USER_AGENT,
      },
    });
    if (!response.ok) {
      throw new Error(`Site details request failed with status ${response.status} for ${siteRecord.site}.`);
    }

    const html = await response.text();
    const parsedPage = parseSiteCalendarPage(html, currentUrl);
    parsedPages.push(parsedPage);

    const mergedDays = mergeSiteCalendarPages(parsedPages);
    if (shouldStopPaging(parsedPage, mergedDays, dateTo)) {
      break;
    }

    if (!parsedPage.nextPagePath) {
      break;
    }

    currentUrl = new URL(parsedPage.nextPagePath, currentUrl).toString();
  }

  const mergedDays = clipDaysToDateRange(mergeSiteCalendarPages(parsedPages), dateFrom, dateTo);
  const availableRanges = buildAvailableRanges(mergedDays);
  const firstPage = parsedPages[0];
  const firstVisibleDate = mergedDays[0]?.date;
  const lastVisibleDate = mergedDays.length > 0 ? mergedDays[mergedDays.length - 1]!.date : undefined;
  const firstAvailableDate = availableRanges[0]?.startDate;

  return {
    site: siteRecord.site,
    loop: siteRecord.loop,
    siteId: siteRecord.siteId,
    detailsUrl: siteRecord.detailsUrl,
    seedDate: dateFrom,
    seedDateBookableNow: isDateBookableNow(dateFrom),
    pagesFetched: parsedPages.length,
    maxConsecutiveNights: availableRanges.reduce((max, range) => Math.max(max, range.nights), 0),
    availableRanges,
    days: mergedDays,
    ...(firstPage?.maxReservationWindowDate ? { maxReservationWindowDate: firstPage.maxReservationWindowDate } : {}),
    ...(firstVisibleDate ? { firstVisibleDate } : {}),
    ...(lastVisibleDate ? { lastVisibleDate } : {}),
    ...(firstAvailableDate ? { firstAvailableDate } : {}),
  };
}
