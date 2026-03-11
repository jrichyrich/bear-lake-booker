import { buildAvailabilityRow, buildDateRange } from '../src/availability-utils';
import type { SearchResult, SiteAvailability } from '../src/reserveamerica';

function makeSite(site: string, targetDateAvailable: boolean): SiteAvailability {
  return {
    site,
    loop: 'BIRCH',
    statuses: [targetDateAvailable ? 'A' : 'R'],
    availableDates: targetDateAvailable ? ['07/18/2026'] : [],
    targetDateAvailable,
  };
}

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    arrivalDates: ['07/18/2026'],
    allSites: [],
    availableSites: [],
    exactDateMatches: [],
    loopValue: '341009',
    totalSites: 60,
    pageCount: 3,
    ...overrides,
  };
}

describe('availability utils', () => {
  test('buildDateRange returns every date in the requested window', () => {
    expect(buildDateRange('07/18/2026', '07/20/2026')).toEqual([
      '07/18/2026',
      '07/19/2026',
      '07/20/2026',
    ]);
  });

  test('buildDateRange allows single-date searches', () => {
    expect(buildDateRange('07/18/2026')).toEqual(['07/18/2026']);
  });

  test('buildAvailabilityRow separates available, unavailable, and not returned sites', () => {
    const row = buildAvailabilityRow(
      '07/18/2026',
      makeSearchResult({
        exactDateMatches: [makeSite('BH09', true)],
        returnedRequestedSites: ['BH09', 'BH10'],
        missingRequestedSites: ['BH11'],
      }),
      ['BH09', 'BH10', 'BH11'],
      '/tmp/preferred-sites.md',
      undefined,
      new Date('2026-03-18T15:00:00-06:00'),
    );

    expect(row.availableSites).toEqual(['BH09']);
    expect(row.unavailableSites).toEqual(['BH10']);
    expect(row.notReturnedSites).toEqual(['BH11']);
    expect(row.pageCount).toBe(3);
    expect(row.totalLoopSitesSeen).toBe(60);
    expect(row.siteListSource).toBe('/tmp/preferred-sites.md');
  });

  test('buildAvailabilityRow marks dates beyond the booking window as not bookable', () => {
    const row = buildAvailabilityRow(
      '07/18/2026',
      makeSearchResult({
        exactDateMatches: [makeSite('BH09', true)],
        returnedRequestedSites: ['BH09'],
      }),
      ['BH09'],
      undefined,
      undefined,
      new Date('2026-03-10T07:59:00-06:00'),
    );

    expect(row.bookableNow).toBe(false);
  });
});
