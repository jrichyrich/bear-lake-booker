import {
  buildArrivalStatusMatrix,
  buildStayWindowStatusMatrix,
  buildSiteAvailabilityCsvReport,
  buildSiteAvailabilityMarkdownReport,
  mapWithConcurrency,
  resolveArrivalSweepEndDate,
} from '../src/site-availability-utils';
import type { AvailabilitySnapshot } from '../src/availability-snapshots';

function makeReport(): AvailabilitySnapshot {
  return {
    generatedAt: '2026-03-11T02:00:00.000Z',
    searchedAt: '2026-03-11T02:00:00.000Z',
    loop: 'BIRCH',
    stayLength: '14',
    seedDate: '07/11/2026',
    dateTo: '07/14/2026',
    requestedSites: ['BH09', 'BH10'],
    missingSites: ['BH99'],
    siteListSource: '/tmp/preferred-sites.md',
    results: [
      {
        site: 'BH09',
        loop: 'BIRCH',
        siteId: '123',
        detailsUrl: 'https://example.com/site/123',
        seedDate: '07/11/2026',
        seedDateBookableNow: true,
        maxReservationWindowDate: '07/31/2026',
        pagesFetched: 2,
        firstVisibleDate: '07/11/2026',
        lastVisibleDate: '07/14/2026',
        firstAvailableDate: '07/11/2026',
        firstFutureAvailableDate: '07/12/2026',
        maxConsecutiveNights: 1,
        maxFutureConsecutiveNights: 2,
        availableRanges: [
          { startDate: '07/11/2026', endDate: '07/11/2026', nights: 1 },
        ],
        futureAvailableRanges: [
          { startDate: '07/12/2026', endDate: '07/13/2026', nights: 2 },
        ],
        days: [
          { date: '07/11/2026', status: 'A', reservable: true, futureReservable: false },
          { date: '07/12/2026', status: 'a', reservable: false, futureReservable: true },
        ],
        firstAvailableArrivalDate: '07/11/2026',
        firstFutureAvailableArrivalDate: '07/12/2026',
        maxConsecutiveAvailableArrivals: 1,
        maxConsecutiveFutureAvailableArrivals: 2,
        availableArrivalRanges: [
          { startDate: '07/11/2026', endDate: '07/11/2026', nights: 1 },
        ],
        futureAvailableArrivalRanges: [
          { startDate: '07/12/2026', endDate: '07/13/2026', nights: 2 },
        ],
        arrivalStatuses: [
          { date: '07/11/2026', status: 'A', reservable: true, futureReservable: false },
          { date: '07/12/2026', status: 'a', reservable: false, futureReservable: true },
          { date: '07/13/2026', status: 'a', reservable: false, futureReservable: true },
          { date: '07/14/2026', status: 'X', reservable: false, futureReservable: false },
        ],
      },
      {
        site: 'BH10',
        loop: 'BIRCH',
        siteId: '124',
        detailsUrl: 'https://example.com/site/124',
        seedDate: '07/11/2026',
        seedDateBookableNow: true,
        maxReservationWindowDate: '07/31/2026',
        pagesFetched: 2,
        firstVisibleDate: '07/11/2026',
        lastVisibleDate: '07/14/2026',
        maxConsecutiveNights: 0,
        maxFutureConsecutiveNights: 0,
        availableRanges: [],
        futureAvailableRanges: [],
        days: [
          { date: '07/11/2026', status: 'R', reservable: false, futureReservable: false },
        ],
        maxConsecutiveAvailableArrivals: 0,
        maxConsecutiveFutureAvailableArrivals: 0,
        availableArrivalRanges: [],
        futureAvailableArrivalRanges: [],
        arrivalStatuses: [
          { date: '07/11/2026', status: 'R', reservable: false, futureReservable: false },
          { date: '07/12/2026', status: 'R', reservable: false, futureReservable: false },
          { date: '07/13/2026', status: 'X', reservable: false, futureReservable: false },
          { date: '07/14/2026', status: 'X', reservable: false, futureReservable: false },
        ],
      },
    ],
  };
}

describe('site availability utils', () => {
  test('builds a markdown report with site summaries', () => {
    const markdown = buildSiteAvailabilityMarkdownReport(makeReport());

    expect(markdown).toContain('# Site Availability Report');
    expect(markdown).toContain('## Arrival Status Matrix');
    expect(markdown).toContain('## BH09');
    expect(markdown).toContain('- Max consecutive nights: 1');
    expect(markdown).toContain('07/11 Sa');
    expect(markdown).toContain('BH09');
    expect(markdown).toContain('- Available ranges: 07/11/2026 -> 07/11/2026 (1 night)');
    expect(markdown).toContain('- Future-available ranges: 07/12/2026 -> 07/13/2026 (2 nights)');
    expect(markdown).toContain('- Missing sites: BH99');
  });

  test('builds a csv report with one row per site', () => {
    const csv = buildSiteAvailabilityCsvReport(makeReport());

    expect(csv).toContain('"site","loop","siteId"');
    expect(csv).toContain('"BH09","BIRCH","123"');
    expect(csv).toContain('"07/11/2026 -> 07/11/2026 (1 night)"');
    expect(csv).toContain('"07/12/2026 -> 07/13/2026 (2 nights)"');
  });

  test('builds an arrival-status matrix from arrival sweep results', () => {
    const matrix = buildArrivalStatusMatrix(makeReport());

    expect(matrix).toContain('Site');
    expect(matrix).toContain('07/11 Sa');
    expect(matrix).toContain('07/12 Su');
    expect(matrix).toContain('BH09');
    expect(matrix).toContain('BH10');
    expect(matrix).toContain('A');
    expect(matrix).toContain('a');
    expect(matrix).toContain('X');
  });

  test('builds a stay-window matrix from raw site calendar rows', () => {
    const matrix = buildStayWindowStatusMatrix(makeReport());

    expect(matrix).toContain('Site');
    expect(matrix).toContain('07/11 Sa');
    expect(matrix).toContain('07/12 Su');
    expect(matrix).toContain('BH09');
    expect(matrix).toContain('BH10');
    expect(matrix).toContain('A');
    expect(matrix).toContain('a');
    expect(matrix).toContain('R');
  });

  test('maps values with bounded concurrency and preserves order', async () => {
    const activeCounts: number[] = [];
    let active = 0;

    const results = await mapWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      active += 1;
      activeCounts.push(active);
      await new Promise((resolve) => setTimeout(resolve, 10));
      active -= 1;
      return value * 10;
    });

    expect(results).toEqual([10, 20, 30, 40]);
    expect(Math.max(...activeCounts)).toBeLessThanOrEqual(2);
  });

  test('uses the seed date as the arrival sweep end when no dateTo is provided', () => {
    expect(resolveArrivalSweepEndDate('07/15/2026', undefined, true)).toBe('07/15/2026');
    expect(resolveArrivalSweepEndDate('07/15/2026', '07/20/2026', true)).toBe('07/20/2026');
    expect(resolveArrivalSweepEndDate('07/15/2026', '07/20/2026', false)).toBeUndefined();
  });
});
