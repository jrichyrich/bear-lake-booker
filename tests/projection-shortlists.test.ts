import {
  addDays,
  buildProjectionEndDate,
  buildProjectionShortlistBasePath,
  classifyProjectionResults,
  computeExpectedWindowEdgeDate,
  type ProjectionShortlist,
} from '../src/projection-shortlists';
import type { SiteCalendarResult } from '../src/site-calendar';

function buildDays(startDate: string, statuses: string[]): SiteCalendarResult['days'] {
  return statuses.map((status, index) => ({
    date: addDays(startDate, index),
    status,
    reservable: status === 'A',
    futureReservable: status === 'a',
  }));
}

function makeResult(overrides: Partial<SiteCalendarResult> = {}): SiteCalendarResult {
  return {
    site: 'BH32',
    loop: 'BIRCH',
    siteId: '6799',
    detailsUrl: 'https://example.com/6799',
    seedDate: '07/15/2026',
    seedDateBookableNow: false,
    pagesFetched: 1,
    maxConsecutiveNights: 1,
    maxFutureConsecutiveNights: 13,
    availableRanges: [{ startDate: '07/15/2026', endDate: '07/15/2026', nights: 1 }],
    futureAvailableRanges: [{ startDate: '07/16/2026', endDate: '07/28/2026', nights: 13 }],
    days: buildDays('07/15/2026', ['A', ...Array.from({ length: 13 }, () => 'a')]),
    ...overrides,
  };
}

describe('projection shortlists', () => {
  test('computes the current 4-month window-edge date', () => {
    expect(computeExpectedWindowEdgeDate(new Date('2026-03-15T07:00:00-06:00'))).toBe('07/15/2026');
  });

  test('builds projection end date from stay length', () => {
    expect(buildProjectionEndDate('07/15/2026', '14')).toBe('07/28/2026');
  });

  test('classifies exact-fit, partial-fit, and excluded sites', () => {
    const shortlist = classifyProjectionResults([
      makeResult(),
      makeResult({
        site: 'BH34',
        siteId: '6801',
        futureAvailableRanges: [{ startDate: '07/16/2026', endDate: '07/22/2026', nights: 7 }],
        maxFutureConsecutiveNights: 7,
        days: buildDays('07/15/2026', ['A', ...Array.from({ length: 7 }, () => 'a'), 'R']),
      }),
      makeResult({
        site: 'BH55',
        siteId: '6822',
        availableRanges: [],
        futureAvailableRanges: [],
        maxConsecutiveNights: 0,
        maxFutureConsecutiveNights: 0,
        days: [{ date: '07/15/2026', status: 'R', reservable: false, futureReservable: false }],
      }),
    ], '07/15/2026', '14');

    expect(shortlist.exactFitSites.map((site) => site.site)).toEqual(['BH32']);
    expect(shortlist.partialFitSites.map((site) => site.site)).toEqual(['BH34']);
    expect(shortlist.excludedSites.map((site) => site.site)).toEqual(['BH55']);
    expect(shortlist.exactFitSites[0]?.projectedFutureNights).toBe(13);
    expect(shortlist.partialFitSites[0]?.projectedFutureNights).toBe(7);
  });

  test('counts already-bookable follow-on nights toward projection fit', () => {
    const shortlist = classifyProjectionResults([
      makeResult({
        site: 'BH77',
        siteId: '6877',
        maxConsecutiveNights: 4,
        maxFutureConsecutiveNights: 0,
        availableRanges: [{ startDate: '07/15/2026', endDate: '07/18/2026', nights: 4 }],
        futureAvailableRanges: [],
        days: buildDays('07/15/2026', ['A', 'A', 'A', 'A']),
      }),
    ], '07/15/2026', '4');

    expect(shortlist.exactFitSites.map((site) => site.site)).toEqual(['BH77']);
    expect(shortlist.exactFitSites[0]?.projectedFutureNights).toBe(3);
    expect(shortlist.exactFitSites[0]?.projectedRangeStart).toBe('07/16/2026');
    expect(shortlist.exactFitSites[0]?.projectedRangeEnd).toBe('07/18/2026');
  });

  test('builds dated shortlist paths under camp sites/availability', () => {
    const shortlist: ProjectionShortlist = {
      generatedAt: '2026-03-15T13:50:00.000Z',
      launchDate: '2026-03-15',
      targetDate: '07/15/2026',
      stayLength: '14',
      loop: 'BIRCH',
      exactFitSites: [],
      partialFitSites: [],
      excludedSites: [],
    };

    expect(buildProjectionShortlistBasePath(shortlist)).toContain('camp sites/availability/shortlist-birch-2026-07-15-14n-2026-03-15');
  });
});
