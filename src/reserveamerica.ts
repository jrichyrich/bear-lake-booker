export const PARK_URL =
  'https://utahstateparks.reserveamerica.com/camping/bear-lake-state-park/r/campgroundDetails.do?contractCode=UT&parkId=343061';

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

export async function searchAvailability(params: SearchParams): Promise<SearchResult> {
  validateDate(params.date);

  const landingResponse = await fetch(PARK_URL, {
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

  const searchResponse = await fetch(PARK_URL, {
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

function parseSearchResult(html: string, targetDate: string): Omit<SearchResult, 'loopValue'> {
  const calendarHtml = extractCalendarHtml(html);
  const columnCount = countCalendarColumns(calendarHtml);
  const arrivalDates = buildArrivalDates(targetDate, columnCount);
  const rows = calendarHtml.split("<div class='br'>").slice(1);
  const sites: SiteAvailability[] = [];

  for (const row of rows) {
    const siteMatch = row.match(/class='siteListLabel'><a [^>]*>([^<]+)<\/a>/);
    const loopMatch = row.match(/class='td loopName'[^>]*>([^<]+)<\/div>/);
    const statusMatches = Array.from(row.matchAll(/<div class='td status ([^']+)'[^>]*>([\s\S]*?)<\/div>/g));

    if (!siteMatch || !loopMatch || statusMatches.length === 0) {
      continue;
    }

    const statuses = statusMatches.map((match) => {
      const className = match[1] ?? '';
      const innerHtml = match[2] ?? '';
      return normalizeStatus(innerHtml, className);
    });
    const availableDates = arrivalDates.filter((_, index) => statuses[index] === 'A');

    sites.push({
      site: decodeHtml(siteMatch[1] ?? '').trim(),
      loop: decodeHtml(loopMatch[1] ?? '').trim(),
      statuses,
      availableDates,
      targetDateAvailable: statuses[0] === 'A',
    });
  }

  return {
    arrivalDates,
    availableSites: sites.filter((site) => site.availableDates.length > 0),
    exactDateMatches: sites.filter((site) => site.targetDateAvailable),
    totalSites: sites.length,
  };
}

function extractCalendarHtml(html: string): string {
  const start = html.indexOf("<div id='calendar' class='items'>");
  if (start === -1) {
    throw new Error('Calendar section was not found in the response.');
  }

  const endMarkers = [
    '<script type="text/javascript">var UWPResultSummary',
    "<div class='h3'>Facilities:",
  ];
  const end = endMarkers
    .map((marker) => html.indexOf(marker, start))
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];

  return html.slice(start, end === undefined ? html.length : end);
}

function countCalendarColumns(calendarHtml: string): number {
  const headerMatch = calendarHtml.match(/<div class='thead'>([\s\S]*?)<div class='br'>/);
  if (!headerMatch) {
    throw new Error('Calendar header was not found in the response.');
  }

  const headerHtml = headerMatch[1] ?? '';
  const matches = headerHtml.match(/class='th calendar/g);
  if (!matches || matches.length === 0) {
    throw new Error('Calendar did not contain any date columns.');
  }

  return matches.length;
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
  const options = Array.from(html.matchAll(/<option\s+value='([^']*)'[^>]*>([^<]+)<\/option>/g)).map(
    (match) => ({
      value: decodeHtml(match[1] ?? '').trim(),
      label: decodeHtml(match[2] ?? '').trim(),
    }),
  );

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

function normalizeStatus(innerHtml: string, className: string): string {
  const text = decodeHtml(innerHtml.replace(/<[^>]+>/g, '')).trim().toUpperCase();
  if (text) {
    return text;
  }

  const classToken = className
    .split(/\s+/)
    .find((token) => token.length === 1 && /[a-z]/i.test(token));

  return classToken ? classToken.toUpperCase() : '?';
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
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
