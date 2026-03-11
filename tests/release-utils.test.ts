import {
  buildReleaseRaceArgs,
  resolveProjectionAt,
  resolveReleaseScoutSites,
  resolveReleaseSchedule,
  selectReleaseSites,
} from '../src/release-utils';
import type { AvailabilitySnapshot } from '../src/availability-snapshots';
import type { SearchResult, SiteAvailability } from '../src/reserveamerica';
import type { LoadedSiteList } from '../src/site-lists';

function makeSite(site: string, availableDates: string[] = []): SiteAvailability {
  return {
    site,
    loop: 'BIRCH',
    statuses: [],
    availableDates,
    targetDateAvailable: availableDates.includes('07/10/2026'),
  };
}

function makeSearchResult(overrides: Partial<SearchResult> = {}): SearchResult {
  const allSites = overrides.allSites ?? [makeSite('BH03'), makeSite('BC85'), makeSite('BH11')];
  return {
    arrivalDates: ['07/10/2026'],
    allSites,
    availableSites: overrides.availableSites ?? [],
    exactDateMatches: overrides.exactDateMatches ?? [],
    loopValue: 'BIRCH',
    totalSites: allSites.length,
    pageCount: 1,
    ...overrides,
  };
}

function makeSnapshot(): AvailabilitySnapshot {
  return {
    generatedAt: '2026-03-11T13:55:00.000Z',
    searchedAt: '2026-03-11T13:55:00.000Z',
    loop: 'BIRCH',
    stayLength: '1',
    seedDate: '07/10/2026',
    requestedSites: ['BH03', 'BC85', 'BH11'],
    missingSites: [],
    results: [
      {
        site: 'BH03',
        loop: 'BIRCH',
        siteId: '1',
        detailsUrl: 'https://example.com/BH03',
        seedDate: '07/10/2026',
        seedDateBookableNow: false,
        pagesFetched: 1,
        maxConsecutiveNights: 2,
        maxFutureConsecutiveNights: 2,
        availableRanges: [],
        futureAvailableRanges: [],
        days: [],
      },
      {
        site: 'BC85',
        loop: 'BIRCH',
        siteId: '2',
        detailsUrl: 'https://example.com/BC85',
        seedDate: '07/10/2026',
        seedDateBookableNow: false,
        pagesFetched: 1,
        maxConsecutiveNights: 5,
        maxFutureConsecutiveNights: 5,
        availableRanges: [],
        futureAvailableRanges: [],
        days: [],
      },
      {
        site: 'BH11',
        loop: 'BIRCH',
        siteId: '3',
        detailsUrl: 'https://example.com/BH11',
        seedDate: '07/10/2026',
        seedDateBookableNow: false,
        pagesFetched: 1,
        maxConsecutiveNights: 3,
        maxFutureConsecutiveNights: 3,
        availableRanges: [],
        futureAvailableRanges: [],
        days: [],
      },
    ],
  };
}

describe('release-utils', () => {
  test('resolves scout and warmup schedule from an arbitrary launch time', () => {
    const now = new Date('2026-03-10T06:00:00-07:00');
    const schedule = resolveReleaseSchedule(now, '09:15:30', 2, 45);

    expect(schedule.launchAt.toISOString()).toBe('2026-03-10T15:15:30.000Z');
    expect(schedule.scoutAt.toISOString()).toBe('2026-03-10T15:13:30.000Z');
    expect(schedule.warmupAt.toISOString()).toBe('2026-03-10T15:14:45.000Z');
  });

  test('rejects a launch time that is already in the past for today', () => {
    const now = new Date('2026-03-10T10:00:00-07:00');

    expect(() => resolveReleaseSchedule(now, '09:59:59', 2, 45)).toThrow('already in the past');
  });

  test('resolves projection time before warmup', () => {
    const launchAt = new Date('2026-03-10T15:15:30.000Z');
    const warmupAt = new Date('2026-03-10T15:14:45.000Z');

    expect(resolveProjectionAt(launchAt, 10, warmupAt).toISOString()).toBe('2026-03-10T15:05:30.000Z');
  });

  test('explicit site overrides are preserved as-is', () => {
    expect(selectReleaseSites(['BH03', 'BH09', 'BH11'], 2, ['bh22', 'BH24'])).toEqual(['BH22', 'BH24']);
  });

  test('scout selection freezes the top sites up to the desired count', () => {
    expect(selectReleaseSites(['BH03', 'BH09', 'BH11'], 2)).toEqual(['BH03', 'BH09']);
  });

  test('release scouting ranks site-list candidates without requiring exact-date matches', () => {
    const loadedSiteList: LoadedSiteList = {
      siteIds: ['BH03', 'BC85', 'BH11'],
      sourcePath: '/repo/camp sites/preferred-sites.md',
      topChoices: ['BH03', 'BC85'],
      backups: ['BH11'],
      exclude: [],
    };

    expect(resolveReleaseScoutSites({
      search: makeSearchResult({
        exactDateMatches: [],
      }),
      availabilitySnapshot: makeSnapshot(),
      loadedSiteList,
      desiredCount: 2,
    })).toEqual(['BC85', 'BH03']);
  });

  test('release scouting falls back to all returned loop sites when live availability is empty', () => {
    expect(resolveReleaseScoutSites({
      search: makeSearchResult({
        availableSites: [],
        exactDateMatches: [],
      }),
      availabilitySnapshot: makeSnapshot(),
      desiredCount: 2,
    })).toEqual(['BC85', 'BH11']);
  });

  test('wrapper-only args are stripped before building race args', () => {
    expect(buildReleaseRaceArgs([
      '--launchTime', '07:59:59',
      '--scoutLeadMinutes', '2',
      '--warmupLeadSeconds', '45',
      '-d', '05/22/2026',
      '--book',
    ], '07:59:59', ['BH03', 'BH09'], 'test')).toEqual([
      '-d', '05/22/2026',
      '--book',
      '--time', '07:59:59',
      '--notificationProfile', 'test',
      '--sites', 'BH03,BH09',
    ]);
  });

  test('explicit notification profile is passed through to race args', () => {
    expect(buildReleaseRaceArgs([
      '--launchTime', '07:59:59',
      '--notificationProfile', 'production',
      '-d', '05/22/2026',
      '--book',
    ], '07:59:59', ['BH03', 'BH09'], 'production')).toEqual([
      '-d', '05/22/2026',
      '--book',
      '--time', '07:59:59',
      '--notificationProfile', 'production',
      '--sites', 'BH03,BH09',
    ]);
  });

  test('siteList is stripped and the resolved source path is passed to race args', () => {
    expect(buildReleaseRaceArgs([
      '--launchTime', '07:59:59',
      '--siteList', 'preferred-sites',
      '--availabilitySnapshot', '/repo/camp sites/availability/june.json',
      '-d', '05/22/2026',
      '--book',
    ], '07:59:59', ['BH03', 'BH09'], 'test', '/repo/camp sites/preferred-sites.md', '/repo/camp sites/availability/june.json')).toEqual([
      '-d', '05/22/2026',
      '--book',
      '--time', '07:59:59',
      '--notificationProfile', 'test',
      '--siteListSource', '/repo/camp sites/preferred-sites.md',
      '--availabilitySnapshot', '/repo/camp sites/availability/june.json',
      '--sites', 'BH03,BH09',
    ]);
  });

  test('projection-only args are stripped before building race args', () => {
    expect(buildReleaseRaceArgs([
      '--launchTime', '07:59:59',
      '--projectionMode', 'window-edge',
      '--projectionPolicy', 'exact-fit-only',
      '--projectionLeadMinutes', '10',
      '--allowProjectionOutsideWindowEdge',
      '-d', '07/15/2026',
      '--book',
    ], '07:59:59', ['BH32'], 'test')).toEqual([
      '-d', '07/15/2026',
      '--book',
      '--time', '07:59:59',
      '--notificationProfile', 'test',
      '--sites', 'BH32',
    ]);
  });
});
