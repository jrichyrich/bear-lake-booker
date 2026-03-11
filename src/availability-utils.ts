import { type SearchResult } from './reserveamerica';
import { isDateBookableNow } from './timer-utils';

export type AvailabilityRow = {
  date: string;
  bookableNow: boolean;
  availableSites: string[];
  unavailableSites: string[];
  notReturnedSites: string[];
  totalLoopSitesSeen: number;
  pageCount: number;
  requestedSites: string[];
  siteListSource?: string;
};

export function parseDateString(value: string): Date {
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

export function formatDateString(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${month}/${day}/${year}`;
}

export function buildDateRange(dateFrom: string, dateTo?: string): string[] {
  const start = parseDateString(dateFrom);
  const end = dateTo ? parseDateString(dateTo) : start;
  if (end.getTime() < start.getTime()) {
    throw new Error(`dateTo ${dateTo} must not be earlier than dateFrom ${dateFrom}.`);
  }

  const dates: string[] = [];
  for (let current = new Date(start); current.getTime() <= end.getTime(); current.setUTCDate(current.getUTCDate() + 1)) {
    dates.push(formatDateString(current));
  }
  return dates;
}

export function normalizeRequestedSites(siteIds: string[]): string[] {
  return Array.from(new Set(siteIds.map((siteId) => siteId.trim().toUpperCase()).filter(Boolean)));
}

export function buildAvailabilityRow(
  date: string,
  searchResult: SearchResult,
  requestedSites: string[],
  siteListSource?: string,
  now = new Date(),
): AvailabilityRow {
  const normalizedRequestedSites = normalizeRequestedSites(requestedSites);
  const exactDateMatches = new Set(searchResult.exactDateMatches.map((site) => site.site.toUpperCase()));
  const returnedRequestedSites = new Set(
    (searchResult.returnedRequestedSites ?? normalizedRequestedSites).map((siteId) => siteId.toUpperCase()),
  );
  const missingRequestedSites = new Set(
    (searchResult.missingRequestedSites ?? []).map((siteId) => siteId.toUpperCase()),
  );

  const availableSites: string[] = [];
  const unavailableSites: string[] = [];
  const notReturnedSites: string[] = [];

  for (const siteId of normalizedRequestedSites) {
    if (missingRequestedSites.has(siteId) || !returnedRequestedSites.has(siteId)) {
      notReturnedSites.push(siteId);
      continue;
    }

    if (exactDateMatches.has(siteId)) {
      availableSites.push(siteId);
      continue;
    }

    unavailableSites.push(siteId);
  }

  return {
    date,
    bookableNow: isDateBookableNow(date, now),
    availableSites,
    unavailableSites,
    notReturnedSites,
    totalLoopSitesSeen: searchResult.totalSites,
    pageCount: searchResult.pageCount,
    requestedSites: normalizedRequestedSites,
    ...(siteListSource ? { siteListSource } : {}),
  };
}
