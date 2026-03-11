import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { PARK_URL } from './config';

const USER_AGENT = 'bear-lake-booker/1.0';

export type SearchParams = {
  date: string;
  length: string;
  loop: string;
  requestedSites?: string[];
};

export type SiteAvailability = {
  site: string;
  loop: string;
  statuses: string[];
  availableDates: string[];
  targetDateAvailable: boolean;
  siteId?: string;
  detailsUrl?: string;
};

export type SearchResult = {
  arrivalDates: string[];
  allSites: SiteAvailability[];
  availableSites: SiteAvailability[];
  exactDateMatches: SiteAvailability[];
  loopValue: string;
  totalSites: number;
  pageCount: number;
  requestedSites?: string[];
  returnedRequestedSites?: string[];
  missingRequestedSites?: string[];
};

type ParsedPageResult = {
  arrivalDates: string[];
  sites: SiteAvailability[];
};

type PageNavigation = {
  totalSites: number | null;
  nextPagePath: string | null;
};

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.log(`Retrying fetch in ${backoff / 1000}s... (Attempt ${attempt}/${maxRetries})`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
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
  throw lastError || new Error('Fetch failed');
}

export async function searchAvailability(params: SearchParams): Promise<SearchResult> {
  validateDate(params.date);

  const landingResponse = await fetchWithRetry(PARK_URL, {
    headers: {
      'user-agent': USER_AGENT,
    },
  });

  if (!landingResponse.ok) {
    throw new Error(`Initial page load failed with status ${landingResponse.status}.`);
  }

  const landingHtml = await landingResponse.text();
  let cookieHeader = getCookieHeader(landingResponse);
  const loopValue = resolveLoopValue(landingHtml, params.loop);
  const body = buildSearchBody(params, loopValue);

  const searchResponse = await fetchWithRetry(PARK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      cookie: cookieHeader,
      referer: PARK_URL,
      'user-agent': USER_AGENT,
    },
    body,
  });

  if (!searchResponse.ok) {
    throw new Error(`Search request failed with status ${searchResponse.status}.`);
  }

  cookieHeader = mergeCookieHeaders(cookieHeader, getCookieHeader(searchResponse));
  const searchHtml = await searchResponse.text();
  const pageHtmls = await fetchAllSearchPages(searchHtml, cookieHeader);
  const mergedResult = mergeSearchResultPages(pageHtmls, params.date);
  const requestedSiteMetadata = buildRequestedSiteMetadata(params.requestedSites, mergedResult.sites);

  return {
    arrivalDates: mergedResult.arrivalDates,
    allSites: mergedResult.sites,
    availableSites: mergedResult.sites.filter((site) => site.availableDates.length > 0),
    exactDateMatches: mergedResult.sites.filter((site) => site.targetDateAvailable),
    totalSites: mergedResult.sites.length,
    pageCount: pageHtmls.length,
    loopValue,
    ...requestedSiteMetadata,
  };
}

function buildSearchBody(params: SearchParams, loopValue: string): URLSearchParams {
  return new URLSearchParams({
    contractCode: 'UT',
    parkId: '343061',
    siteTypeFilter: 'ALL',
    lob: '',
    availStatus: '',
    submitSiteForm: 'true',
    search: 'site',
    campingDate: params.date,
    lengthOfStay: params.length,
    campingDateFlex: '',
    currentMaximumWindow: '12',
    loop: loopValue,
    siteCode: '',
    lookingFor: '',
  });
}

export function parseSearchResult(html: string, targetDate: string): Omit<SearchResult, 'loopValue'> {
  const parsedPage = parseSearchResultPage(html, targetDate);

  return {
    arrivalDates: parsedPage.arrivalDates,
    allSites: parsedPage.sites,
    availableSites: parsedPage.sites.filter((site) => site.availableDates.length > 0),
    exactDateMatches: parsedPage.sites.filter((site) => site.targetDateAvailable),
    totalSites: parsedPage.sites.length,
    pageCount: 1,
  };
}

export function parseSearchResultPage(html: string, targetDate: string): ParsedPageResult {
  const $ = cheerio.load(html);
  const calendar = findCalendar($);
  if (!calendar || calendar.length === 0) {
    saveDebugHtml(html);
    throw new Error('Calendar section was not found in the response. Raw HTML saved to logs.');
  }

  const arrivalDates = buildArrivalDates(targetDate, countCalendarColumns(calendar));
  const sites = extractSitesAvailability($, calendar, arrivalDates);

  return {
    arrivalDates,
    sites,
  };
}

export function parsePageNavigation(html: string): PageNavigation {
  const $ = cheerio.load(html);
  const totalSitesText = $('span[id^="resulttotal_"]').not('[id*="_dr_"]').first().text().trim();
  const totalSites = totalSitesText ? parseInt(totalSitesText, 10) : null;
  const nextAnchor = $('a[id^="resultNext_"]').not('[id*="_dr_"]').filter((_, el) => {
    const classAttr = ($(el).attr('class') || '').toLowerCase();
    return !classAttr.includes('disabled');
  }).first();
  const href = nextAnchor.attr('href');

  return {
    totalSites: Number.isFinite(totalSites) ? totalSites : null,
    nextPagePath: extractPagingPathFromHref(href),
  };
}

export function mergeSearchResultPages(pageHtmls: string[], targetDate: string): ParsedPageResult {
  if (pageHtmls.length === 0) {
    throw new Error('At least one search page is required.');
  }

  let arrivalDates: string[] | null = null;
  const mergedSites: SiteAvailability[] = [];
  const seenSiteIds = new Set<string>();
  const expectedTotalSites = parsePageNavigation(pageHtmls[0]!).totalSites;

  for (const pageHtml of pageHtmls) {
    const parsedPage = parseSearchResultPage(pageHtml, targetDate);
    if (!arrivalDates) {
      arrivalDates = parsedPage.arrivalDates;
    } else if (!areDatesEqual(arrivalDates, parsedPage.arrivalDates)) {
      throw new Error('Search result pages returned inconsistent arrival-date columns.');
    }

    for (const site of parsedPage.sites) {
      const normalizedSiteId = site.site.toUpperCase();
      if (seenSiteIds.has(normalizedSiteId)) {
        throw new Error(`Duplicate site ${normalizedSiteId} encountered while merging paginated search results.`);
      }
      seenSiteIds.add(normalizedSiteId);
      mergedSites.push(site);
    }
  }

  if (!arrivalDates) {
    throw new Error('No arrival dates were parsed from the search results.');
  }

  if (expectedTotalSites !== null && mergedSites.length !== expectedTotalSites) {
    throw new Error(`Expected ${expectedTotalSites} total sites across paginated results, but parsed ${mergedSites.length}.`);
  }

  return {
    arrivalDates,
    sites: mergedSites,
  };
}

function saveDebugHtml(html: string) {
  const logDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const filename = `debug-parser-fail-${Date.now()}.html`;
  fs.writeFileSync(path.join(logDir, filename), html, 'utf-8');
}

function extractSitesAvailability(
  $: cheerio.CheerioAPI,
  calendar: cheerio.Cheerio<any>,
  arrivalDates: string[]
): SiteAvailability[] {
  const sites: SiteAvailability[] = [];

  calendar.find('.br').each((_, element) => {
    const row = $(element);
    if (row.hasClass('thead')) return; // Skip header row

    const siteName = row.find('.siteListLabel a').text().trim();
    const siteHref = row.find('.siteListLabel a').attr('href')?.trim() || '';
    const loopName = row.find('.td.loopName').text().trim();
    const statusElements = row.find('.td.status');

    if (!siteName || !loopName || statusElements.length === 0) {
      return;
    }

    const statuses = extractStatuses($, statusElements);
    const availableDates = arrivalDates.filter((_, index) => statuses[index] === 'A');

    sites.push({
      site: siteName,
      loop: loopName,
      statuses,
      availableDates,
      targetDateAvailable: statuses[0] === 'A',
      ...(extractSiteId(siteHref) ? { siteId: extractSiteId(siteHref)! } : {}),
      ...(siteHref ? { detailsUrl: new URL(siteHref, PARK_URL).toString() } : {}),
    });
  });

  return sites;
}

function extractSiteId(href: string): string | null {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href, PARK_URL);
    return url.searchParams.get('siteId');
  } catch {
    return null;
  }
}

function extractStatuses($: cheerio.CheerioAPI, statusElements: cheerio.Cheerio<any>): string[] {
  return statusElements.toArray().map((el) => {
    const cell = $(el);
    const text = cell.text().trim().toUpperCase();
    if (text) return text;

    // Extract status code from class (e.g., 'status A')
    const classes = cell.attr('class') || '';
    const code = classes.split(/\s+/).find((c) => c.length === 1 && /[A-Z]/i.test(c));
    return code ? code.toUpperCase() : '?';
  });
}

function countCalendarColumns(calendar: cheerio.Cheerio<any>): number {
  const headerColumns = calendar.find('.thead .th.calendar');
  if (headerColumns.length === 0) {
    throw new Error('Calendar did not contain any date columns.');
  }
  return headerColumns.length;
}

function buildArrivalDates(startDate: string, columnCount: number): string[] {
  const firstDate = parseDate(startDate);
  const dates: string[] = [];

  for (let offset = 0; offset < columnCount; offset += 1) {
    const current = new Date(firstDate);
    current.setUTCDate(firstDate.getUTCDate() + offset);
    dates.push(formatDate(current));
  }

  return dates;
}

function parseDate(value: string): Date {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
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

function validateDate(value: string) {
  parseDate(value);
}

function resolveLoopValue(html: string, desiredLoop: string): string {
  const $ = cheerio.load(html);
  const options = $('select#loop option')
    .toArray()
    .map((el) => ({
      value: $(el).attr('value')?.trim() || '',
      label: $(el).text().trim(),
    }));

  const match = options.find(
    (option) => option.label.localeCompare(desiredLoop, undefined, { sensitivity: 'accent' }) === 0,
  );

  if (!match || !match.value) {
    const availableLoops = options
      .filter((option) => option.value)
      .map((option) => option.label)
      .join(', ');
    throw new Error(`Loop "${desiredLoop}" was not found. Available loops: ${availableLoops}`);
  }

  return match.value;
}

function findCalendar($: cheerio.CheerioAPI): cheerio.Cheerio<any> | null {
  const byId = $('#calendar').first();
  if (byId.length > 0) {
    return byId;
  }

  const fallback = $('.items').filter((_, element) => {
    const node = $(element);
    return node.find('.br').length > 0 && node.find('.thead .th.calendar').length > 0;
  }).first();
  if (fallback.length > 0) {
    return fallback;
  }

  return null;
}

async function fetchAllSearchPages(initialHtml: string, cookieHeader: string): Promise<string[]> {
  const pages = [initialHtml];
  const visitedPagePaths = new Set<string>();
  let navigation = parsePageNavigation(initialHtml);

  while (navigation.nextPagePath) {
    if (visitedPagePaths.has(navigation.nextPagePath)) {
      throw new Error(`Encountered duplicate pagination path while fetching search results: ${navigation.nextPagePath}`);
    }
    visitedPagePaths.add(navigation.nextPagePath);

    const nextPageUrl = new URL(navigation.nextPagePath, PARK_URL).toString();
    const response = await fetchWithRetry(nextPageUrl, {
      headers: {
        cookie: cookieHeader,
        referer: PARK_URL,
        'user-agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`Paged search request failed with status ${response.status} for ${nextPageUrl}.`);
    }

    const pageHtml = await response.text();
    pages.push(pageHtml);
    cookieHeader = mergeCookieHeaders(cookieHeader, getCookieHeader(response));
    navigation = parsePageNavigation(pageHtml);
  }

  return pages;
}

function extractPagingPathFromHref(href: string | undefined): string | null {
  if (!href) {
    return null;
  }

  const trimmed = href.trim();
  if (!trimmed || trimmed.toLowerCase().startsWith('javascript:void')) {
    return null;
  }

  const directPath = /^\/[^'"]+/.exec(trimmed);
  if (directPath) {
    return directPath[0];
  }

  const executePagingMatch = /executePaging\((['"])(.+?)\1\)/.exec(trimmed);
  if (!executePagingMatch || !executePagingMatch[2]) {
    return null;
  }

  return decodeHtmlEntities(executePagingMatch[2]);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function areDatesEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function buildRequestedSiteMetadata(requestedSites: string[] | undefined, sites: SiteAvailability[]): {
  requestedSites?: string[];
  returnedRequestedSites?: string[];
  missingRequestedSites?: string[];
} {
  if (!requestedSites || requestedSites.length === 0) {
    return {};
  }

  const normalizedRequestedSites = Array.from(
    new Set(requestedSites.map((siteId) => siteId.trim().toUpperCase()).filter(Boolean)),
  );
  const returnedSiteIds = new Set(sites.map((site) => site.site.toUpperCase()));
  const returnedRequestedSites = normalizedRequestedSites.filter((siteId) => returnedSiteIds.has(siteId));
  const missingRequestedSites = normalizedRequestedSites.filter((siteId) => !returnedSiteIds.has(siteId));

  return {
    requestedSites: normalizedRequestedSites,
    returnedRequestedSites,
    missingRequestedSites,
  };
}

function getCookieHeader(response: Response): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headers.getSetCookie?.() ?? splitSetCookieHeader(response.headers.get('set-cookie'));
  return setCookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

function mergeCookieHeaders(...cookieHeaders: string[]): string {
  const cookies = new Map<string, string>();

  for (const header of cookieHeaders) {
    for (const cookie of header.split(';').map((value) => value.trim()).filter(Boolean)) {
      const [name, ...rest] = cookie.split('=');
      if (!name || rest.length === 0) {
        continue;
      }
      cookies.set(name, `${name}=${rest.join('=')}`);
    }
  }

  return Array.from(cookies.values()).join('; ');
}

function splitSetCookieHeader(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value.split(/,(?=[^;,]+=)/g);
}
