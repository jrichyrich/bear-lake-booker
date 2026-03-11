import {
  buildSiteAvailabilityCsvReport,
  buildSiteAvailabilityMarkdownReport,
  mapWithConcurrency,
  type SiteAvailabilityReport,
} from '../src/site-availability-utils';

function makeReport(): SiteAvailabilityReport {
  return {
    searchedAt: '2026-03-11T02:00:00.000Z',
    loop: 'BIRCH',
    stayLength: '1',
    seedDate: '07/01/2026',
    dateTo: '07/31/2026',
    requestedSites: ['BH09', 'BH10'],
    missingSites: ['BH99'],
    siteListSource: '/tmp/preferred-sites.md',
    results: [
      {
        site: 'BH09',
        loop: 'BIRCH',
        siteId: '123',
        detailsUrl: 'https://example.com/site/123',
        seedDate: '07/01/2026',
        seedDateBookableNow: true,
        maxReservationWindowDate: '07/31/2026',
        pagesFetched: 2,
        firstVisibleDate: '07/01/2026',
        lastVisibleDate: '07/31/2026',
        firstAvailableDate: '07/04/2026',
        maxConsecutiveNights: 5,
        availableRanges: [
          { startDate: '07/04/2026', endDate: '07/08/2026', nights: 5 },
        ],
        days: [],
      },
    ],
  };
}

describe('site availability utils', () => {
  test('builds a markdown report with site summaries', () => {
    const markdown = buildSiteAvailabilityMarkdownReport(makeReport());

    expect(markdown).toContain('# Site Availability Report');
    expect(markdown).toContain('## BH09');
    expect(markdown).toContain('- Max consecutive nights: 5');
    expect(markdown).toContain('- Available ranges: 07/04/2026 -> 07/08/2026 (5 nights)');
    expect(markdown).toContain('- Missing sites: BH99');
  });

  test('builds a csv report with one row per site', () => {
    const csv = buildSiteAvailabilityCsvReport(makeReport());

    expect(csv).toContain('"site","loop","siteId"');
    expect(csv).toContain('"BH09","BIRCH","123"');
    expect(csv).toContain('"07/04/2026 -> 07/08/2026 (5 nights)"');
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
});
