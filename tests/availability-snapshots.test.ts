import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildAvailabilitySnapshotPath,
  buildSnapshotSiteStrengths,
  findMatchingAvailabilitySnapshots,
  loadAvailabilitySnapshot,
  loadLatestAvailabilitySnapshot,
  rankRequestedSitesForCapture,
  writeAvailabilitySnapshot,
  type AvailabilitySnapshot,
} from '../src/availability-snapshots';
import type { LoadedSiteList } from '../src/site-lists';

function makeSnapshot(overrides: Partial<AvailabilitySnapshot> = {}): AvailabilitySnapshot {
  return {
    generatedAt: '2026-03-11T03:00:00.000Z',
    searchedAt: '2026-03-11T03:00:00.000Z',
    snapshotKind: 'site-calendar',
    loop: 'BIRCH',
    stayLength: '1',
    seedDate: '06/01/2026',
    dateTo: '06/30/2026',
    requestedSites: ['BH09', 'BH11', 'BH12'],
    missingSites: [],
    siteListSource: '/repo/camp sites/preferred-sites.md',
    results: [
      {
        site: 'BH09',
        loop: 'BIRCH',
        siteId: '1',
        detailsUrl: 'https://example.com/1',
        seedDate: '06/01/2026',
        seedDateBookableNow: true,
        pagesFetched: 3,
        firstVisibleDate: '06/01/2026',
        lastVisibleDate: '06/30/2026',
        firstAvailableDate: '06/01/2026',
        firstFutureAvailableDate: '07/12/2026',
        maxConsecutiveNights: 10,
        maxFutureConsecutiveNights: 4,
        availableRanges: [{ startDate: '06/01/2026', endDate: '06/10/2026', nights: 10 }],
        futureAvailableRanges: [{ startDate: '07/12/2026', endDate: '07/15/2026', nights: 4 }],
        days: [
          { date: '06/01/2026', status: 'A', reservable: true, futureReservable: false },
          { date: '06/02/2026', status: 'A', reservable: true, futureReservable: false },
          { date: '06/03/2026', status: 'R', reservable: false, futureReservable: false },
          { date: '07/12/2026', status: 'a', reservable: false, futureReservable: true },
        ],
      },
      {
        site: 'BH11',
        loop: 'BIRCH',
        siteId: '2',
        detailsUrl: 'https://example.com/2',
        seedDate: '06/01/2026',
        seedDateBookableNow: true,
        pagesFetched: 3,
        firstVisibleDate: '06/01/2026',
        lastVisibleDate: '06/30/2026',
        firstAvailableDate: '06/05/2026',
        maxFutureConsecutiveNights: 0,
        maxConsecutiveNights: 5,
        availableRanges: [{ startDate: '06/05/2026', endDate: '06/09/2026', nights: 5 }],
        futureAvailableRanges: [],
        days: [
          { date: '06/05/2026', status: 'A', reservable: true, futureReservable: false },
          { date: '06/06/2026', status: 'A', reservable: true, futureReservable: false },
        ],
      },
      {
        site: 'BH12',
        loop: 'BIRCH',
        siteId: '3',
        detailsUrl: 'https://example.com/3',
        seedDate: '06/01/2026',
        seedDateBookableNow: true,
        pagesFetched: 3,
        firstVisibleDate: '06/01/2026',
        lastVisibleDate: '06/30/2026',
        maxFutureConsecutiveNights: 6,
        maxConsecutiveNights: 0,
        availableRanges: [],
        futureAvailableRanges: [{ startDate: '06/20/2026', endDate: '06/25/2026', nights: 6 }],
        days: [
          { date: '06/01/2026', status: 'R', reservable: false, futureReservable: false },
          { date: '06/20/2026', status: 'a', reservable: false, futureReservable: true },
        ],
      },
    ],
    ...overrides,
  };
}

describe('availability snapshots', () => {
  test('builds default paths under camp sites/availability', () => {
    const snapshotPath = buildAvailabilitySnapshotPath(makeSnapshot());
    expect(snapshotPath).toContain(path.join('camp sites', 'availability'));
    expect(snapshotPath).toContain('birch-2026-06-01-2026-06-30');
  });

  test('writes and reloads a canonical snapshot with per-day data', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bear-lake-snapshots-'));
    const outputPath = path.join(tempDir, 'snapshot.json');
    writeAvailabilitySnapshot(makeSnapshot(), outputPath);

    const loaded = loadAvailabilitySnapshot(outputPath);
    expect(loaded.generatedAt).toBe('2026-03-11T03:00:00.000Z');
    expect(loaded.results[0]?.days[0]?.status).toBe('A');
    expect(loaded.results[0]?.availableRanges[0]?.nights).toBe(10);
  });

  test('loads the latest snapshot matching loop/date/site list/stay length', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bear-lake-snapshots-'));
    writeAvailabilitySnapshot(makeSnapshot({
      generatedAt: '2026-03-10T03:00:00.000Z',
      searchedAt: '2026-03-10T03:00:00.000Z',
    }), path.join(tempDir, 'older.json'));
    writeAvailabilitySnapshot(makeSnapshot({
      generatedAt: '2026-03-11T03:00:00.000Z',
      searchedAt: '2026-03-11T03:00:00.000Z',
    }), path.join(tempDir, 'newer.json'));

    const latest = loadLatestAvailabilitySnapshot({
      loop: 'BIRCH',
      stayLength: '1',
      targetDate: '06/15/2026',
      siteListSource: '/repo/camp sites/preferred-sites.md',
      snapshotsDir: tempDir,
    });

    expect(latest?.generatedAt).toBe('2026-03-11T03:00:00.000Z');
  });

  test('returns matching snapshots sorted newest-first', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bear-lake-snapshots-'));
    writeAvailabilitySnapshot(makeSnapshot({
      generatedAt: '2026-03-10T03:00:00.000Z',
      searchedAt: '2026-03-10T03:00:00.000Z',
    }), path.join(tempDir, 'older.json'));
    writeAvailabilitySnapshot(makeSnapshot({
      generatedAt: '2026-03-12T03:00:00.000Z',
      searchedAt: '2026-03-12T03:00:00.000Z',
    }), path.join(tempDir, 'newest.json'));
    writeAvailabilitySnapshot(makeSnapshot({
      generatedAt: '2026-03-11T03:00:00.000Z',
      searchedAt: '2026-03-11T03:00:00.000Z',
    }), path.join(tempDir, 'middle.json'));

    const matches = findMatchingAvailabilitySnapshots({
      loop: 'BIRCH',
      stayLength: '1',
      targetDate: '06/15/2026',
      siteListSource: '/repo/camp sites/preferred-sites.md',
      snapshotsDir: tempDir,
    });

    expect(matches.map((entry) => entry.snapshot.generatedAt)).toEqual([
      '2026-03-12T03:00:00.000Z',
      '2026-03-11T03:00:00.000Z',
      '2026-03-10T03:00:00.000Z',
    ]);
  });

  test('ignores snapshots with the wrong stay length or snapshot kind', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bear-lake-snapshots-'));
    writeAvailabilitySnapshot(makeSnapshot({
      generatedAt: '2026-03-10T03:00:00.000Z',
      searchedAt: '2026-03-10T03:00:00.000Z',
      stayLength: '14',
    }), path.join(tempDir, 'wrong-length.json'));
    writeAvailabilitySnapshot(makeSnapshot({
      generatedAt: '2026-03-11T03:00:00.000Z',
      searchedAt: '2026-03-11T03:00:00.000Z',
      snapshotKind: 'projection',
    }), path.join(tempDir, 'wrong-kind.json'));
    writeAvailabilitySnapshot(makeSnapshot({
      generatedAt: '2026-03-12T03:00:00.000Z',
      searchedAt: '2026-03-12T03:00:00.000Z',
      stayLength: '1',
      snapshotKind: 'site-calendar',
    }), path.join(tempDir, 'correct.json'));

    const latest = loadLatestAvailabilitySnapshot({
      loop: 'BIRCH',
      stayLength: '1',
      targetDate: '06/15/2026',
      siteListSource: '/repo/camp sites/preferred-sites.md',
      snapshotKind: 'site-calendar',
      snapshotsDir: tempDir,
    });

    expect(latest?.generatedAt).toBe('2026-03-12T03:00:00.000Z');
  });

  test('builds deterministic site strengths and ranking', () => {
    const strengths = buildSnapshotSiteStrengths(makeSnapshot());
    expect(strengths.get('BH09')?.maxConsecutiveNights).toBe(10);
    expect(strengths.get('BH12')?.availableDayCount).toBe(0);
    expect(strengths.get('BH12')?.maxFutureConsecutiveNights).toBe(6);

    const loadedSiteList: LoadedSiteList = {
      sourcePath: '/repo/camp sites/preferred-sites.md',
      siteIds: ['BH11', 'BH09', 'BH12'],
      topChoices: ['BH11', 'BH09'],
      backups: ['BH12'],
      exclude: [],
    };
    expect(rankRequestedSitesForCapture(['BH11', 'BH09', 'BH12'], makeSnapshot(), loadedSiteList)).toEqual([
      'BH09',
      'BH11',
      'BH12',
    ]);
  });
});
