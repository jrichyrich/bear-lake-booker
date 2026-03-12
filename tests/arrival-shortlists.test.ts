import {
  buildArrivalShortlistMarkdown,
  classifyArrivalSnapshot,
} from '../src/arrival-shortlists';
import type { AvailabilitySnapshot } from '../src/availability-snapshots';

function makeSnapshot(): AvailabilitySnapshot {
  return {
    generatedAt: '2026-03-12T01:00:00.000Z',
    searchedAt: '2026-03-12T01:00:00.000Z',
    snapshotKind: 'site-calendar',
    loop: 'BIRCH',
    stayLength: '14',
    seedDate: '07/11/2026',
    dateTo: '07/24/2026',
    requestedSites: ['BH09', 'BH10', 'BH11'],
    missingSites: [],
    siteListSource: '/tmp/preferred-sites.md',
    results: [
      {
        site: 'BH09',
        loop: 'BIRCH',
        siteId: '123',
        detailsUrl: 'https://example.com/123',
        seedDate: '07/11/2026',
        seedDateBookableNow: true,
        pagesFetched: 1,
        maxConsecutiveNights: 0,
        maxFutureConsecutiveNights: 0,
        availableRanges: [],
        futureAvailableRanges: [],
        days: [],
        arrivalStatuses: [
          { date: '07/11/2026', status: 'A', reservable: true, futureReservable: false },
        ],
      },
      {
        site: 'BH10',
        loop: 'BIRCH',
        siteId: '124',
        detailsUrl: 'https://example.com/124',
        seedDate: '07/11/2026',
        seedDateBookableNow: true,
        pagesFetched: 1,
        maxConsecutiveNights: 0,
        maxFutureConsecutiveNights: 0,
        availableRanges: [],
        futureAvailableRanges: [],
        days: [],
        arrivalStatuses: [
          { date: '07/11/2026', status: 'a', reservable: false, futureReservable: true },
        ],
      },
      {
        site: 'BH11',
        loop: 'BIRCH',
        siteId: '125',
        detailsUrl: 'https://example.com/125',
        seedDate: '07/11/2026',
        seedDateBookableNow: true,
        pagesFetched: 1,
        maxConsecutiveNights: 0,
        maxFutureConsecutiveNights: 0,
        availableRanges: [],
        futureAvailableRanges: [],
        days: [],
        arrivalStatuses: [
          { date: '07/11/2026', status: 'X', reservable: false, futureReservable: false },
        ],
      },
    ],
  };
}

describe('arrival shortlists', () => {
  test('classifies exact-fit, future-only, and blocked sites from arrival statuses', () => {
    const shortlist = classifyArrivalSnapshot(makeSnapshot(), '07/11/2026', '/tmp/snapshot.json');

    expect(shortlist.exactFitSites.map((site) => site.site)).toEqual(['BH09']);
    expect(shortlist.futureOnlySites.map((site) => site.site)).toEqual(['BH10']);
    expect(shortlist.blockedSites.map((site) => site.site)).toEqual(['BH11']);
    expect(shortlist.sourceSnapshotPath).toBe('/tmp/snapshot.json');
  });

  test('builds a readable markdown summary', () => {
    const markdown = buildArrivalShortlistMarkdown(
      classifyArrivalSnapshot(makeSnapshot(), '07/11/2026', '/tmp/snapshot.json'),
    );

    expect(markdown).toContain('# Arrival Shortlist');
    expect(markdown).toContain('## Exact Fit Sites');
    expect(markdown).toContain('- BH09: status=A, siteId=123');
    expect(markdown).toContain('## Future-Only Sites');
    expect(markdown).toContain('- BH10: status=a, siteId=124');
    expect(markdown).toContain('## Blocked Sites');
    expect(markdown).toContain('- Count: 1');
  });
});
