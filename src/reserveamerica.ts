import * as cheerio from 'cheerio';
import * as fs from 'fs';
import * as path from 'path';
import { PARK_URL } from './config';

const USER_AGENT = 'bear-lake-booker/1.0';

export type SearchParams = {
  date: string;
  length: string;
  loop: string;
};

export type SiteAvailability = {
  site: string;
  loop: string;
  statuses: string[];
  availableDates: string[];
  targetDateAvailable: boolean;
};

export type SearchResult = {
  arrivalDates: string[];
  availableSites: SiteAvailability[];
  exactDateMatches: SiteAvailability[];
  loopValue: string;
  totalSites: number;
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
  const cookieHeader = getCookieHeader(landingResponse);
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

  const searchHtml = await searchResponse.text();
  return {
    ...parseSearchResult(searchHtml, params.date),
    loopValue,
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
  const $ = cheerio.load(html);
  const calendar = $('#calendar');
  if (calendar.length === 0) {
    const logDir = path.resolve(process.cwd(), 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const filename = `debug-parser-fail-${Date.now()}.html`;
    fs.writeFileSync(path.join(logDir, filename), html, 'utf-8');
    throw new Error(`Calendar section was not found in the response. Raw HTML saved to logs/${filename}`);
  }

  const arrivalDates = buildArrivalDates(targetDate, countCalendarColumns($));
  const sites: SiteAvailability[] = [];

  calendar.find('.br').each((_, element) => {
    const row = $(element);
    if (row.hasClass('thead')) return; // Skip header row

    const siteName = row.find('.siteListLabel a').text().trim();
    const loopName = row.find('.td.loopName').text().trim();
    const statusElements = row.find('.td.status');

    if (!siteName || !loopName || statusElements.length === 0) {
      return;
    }

    const statuses = statusElements.toArray().map((el) => {
      const cell = $(el);
      const text = cell.text().trim().toUpperCase();
      if (text) return text;

      // Extract status code from class (e.g., 'status A')
      const classes = cell.attr('class') || '';
      const code = classes.split(/\s+/).find((c) => c.length === 1 && /[A-Z]/i.test(c));
      return code ? code.toUpperCase() : '?';
    });

    const availableDates = arrivalDates.filter((_, index) => statuses[index] === 'A');

    sites.push({
      site: siteName,
      loop: loopName,
      statuses,
      availableDates,
      targetDateAvailable: statuses[0] === 'A',
    });
  });

  return {
    arrivalDates,
    availableSites: sites.filter((site) => site.availableDates.length > 0),
    exactDateMatches: sites.filter((site) => site.targetDateAvailable),
    totalSites: sites.length,
  };
}

function countCalendarColumns($: cheerio.CheerioAPI): number {
  const headerColumns = $('.thead .th.calendar');
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

function getCookieHeader(response: Response): string {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = headers.getSetCookie?.() ?? splitSetCookieHeader(response.headers.get('set-cookie'));
  return setCookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

function splitSetCookieHeader(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value.split(/,(?=[^;,]+=)/g);
}
