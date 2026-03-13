jest.mock('../src/workflow-config', () => ({
  WORKFLOW_CONFIG_FILENAME: 'bear-lake-workflow.json',
  loadWorkflowConfig: () => ({
    config: {
      loop: 'BIRCH',
      siteList: 'preferred-sites',
      scoutWindowDays: 14,
      scoutConcurrency: 4,
      arrivalSweepConcurrency: 3,
      bookingConcurrency: 6,
      launchTime: '07:59:59',
      notificationProfile: 'test',
      headed: true,
      checkoutAuthMode: 'manual',
      accounts: [],
    },
    configPath: null,
  }),
}));

jest.mock('../src/site-lists', () => ({
  loadSiteList: () => ({
    sourcePath: '/tmp/preferred-sites.md',
    siteIds: ['BH09', 'BH11'],
    topChoices: ['BH09'],
    backups: ['BH11'],
    exclude: [],
  }),
}));

jest.mock('../src/site-availability', () => ({
  runSiteAvailability: jest.fn(async () => ({
    report: {
      generatedAt: '2026-03-13T16:00:00.000Z',
      searchedAt: '2026-03-13T16:00:00.000Z',
      snapshotKind: 'site-calendar',
      loop: 'BIRCH',
      stayLength: '14',
      seedDate: '07/13/2026',
      dateTo: '07/26/2026',
      requestedSites: ['BH09'],
      missingSites: [],
      siteListSource: '/tmp/preferred-sites.md',
      results: [],
    },
    snapshotPath: '/tmp/scout-snapshot.json',
  })),
}));

jest.mock('../src/release', () => ({
  runReleaseCliArgs: jest.fn(async () => 0),
}));

jest.mock('../src/availability-snapshots', () => ({
  resolveLatestAvailabilitySnapshotPath: jest.fn(() => '/tmp/scout-snapshot.json'),
  loadLatestAvailabilitySnapshot: jest.fn(() => ({
    generatedAt: '2026-03-13T16:00:00.000Z',
    searchedAt: '2026-03-13T16:00:00.000Z',
    snapshotKind: 'site-calendar',
    loop: 'BIRCH',
    stayLength: '14',
    seedDate: '07/13/2026',
    dateTo: '07/26/2026',
    requestedSites: ['BH09'],
    missingSites: [],
    siteListSource: '/tmp/preferred-sites.md',
    results: [],
  })),
}));

jest.mock('../src/site-availability-utils', () => ({
  buildArrivalStatusMatrix: jest.fn(() => null),
  buildStayWindowStatusMatrix: jest.fn(() => null),
}));

jest.mock('../src/arrival-shortlists', () => ({
  classifyArrivalSnapshot: jest.fn(() => ({
    generatedAt: '2026-03-13T16:00:01.000Z',
    targetDate: '07/13/2026',
    stayLength: '14',
    loop: 'BIRCH',
    sourceSnapshotGeneratedAt: '2026-03-13T16:00:00.000Z',
    sourceSnapshotPath: '/tmp/scout-snapshot.json',
    siteListSource: '/tmp/preferred-sites.md',
    targets: [
      {
        site: 'BH09',
        siteId: '9',
        detailsUrl: 'https://example.com/bh09',
        targetDate: '07/13/2026',
        stayLength: '14',
        fit: 'exact',
        arrivalStatus: 'A',
        stayWindowStatuses: ['A', 'a'],
        sourceSnapshotPath: '/tmp/scout-snapshot.json',
        sourceGeneratedAt: '2026-03-13T16:00:00.000Z',
      },
    ],
  })),
  findMatchingArrivalShortlists: jest.fn(() => []),
  loadLatestArrivalShortlist: jest.fn(() => ({
    shortlistPath: '/tmp/arrival-shortlist.json',
    shortlist: {
      generatedAt: '2026-03-13T16:00:01.000Z',
      targetDate: '07/13/2026',
      stayLength: '14',
      loop: 'BIRCH',
      sourceSnapshotGeneratedAt: '2026-03-13T16:00:00.000Z',
      sourceSnapshotPath: '/tmp/scout-snapshot.json',
      siteListSource: '/tmp/preferred-sites.md',
      targets: [
        {
          site: 'BH09',
          siteId: '9',
          detailsUrl: 'https://example.com/bh09',
          targetDate: '07/13/2026',
          stayLength: '14',
          fit: 'exact',
          arrivalStatus: 'A',
          stayWindowStatuses: ['A', 'a'],
          sourceSnapshotPath: '/tmp/scout-snapshot.json',
          sourceGeneratedAt: '2026-03-13T16:00:00.000Z',
        },
      ],
    },
  })),
  listExactFitTargets: jest.fn((shortlist) => shortlist.targets.filter((target: any) => target.fit === 'exact')),
  listFutureOnlyTargets: jest.fn(() => []),
  writeArrivalShortlistJson: jest.fn(() => '/tmp/arrival-shortlist.json'),
  writeArrivalShortlistMarkdown: jest.fn(() => '/tmp/arrival-shortlist.md'),
}));

import { runWorkflowCliArgs } from '../src/workflow';
import { runSiteAvailability } from '../src/site-availability';
import { runReleaseCliArgs } from '../src/release';

describe('workflow CLI dispatch', () => {
  const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
  });

  test('scout dispatches directly to the site availability runner', async () => {
    await expect(runWorkflowCliArgs(['scout', '--date', '07/13/2026', '--length', '14'])).resolves.toBe(0);

    expect(runSiteAvailability).toHaveBeenCalledWith(expect.objectContaining({
      dateFrom: '07/13/2026',
      dateTo: '07/26/2026',
      stayLength: '14',
      loop: 'BIRCH',
      siteListNameOrPath: 'preferred-sites',
      arrivalSweep: true,
      arrivalSweepConcurrency: 3,
    }));
  });

  test('book dispatches directly to release using the shortlist exact-fit targets', async () => {
    await expect(runWorkflowCliArgs(['book', '--date', '07/13/2026', '--length', '14'])).resolves.toBe(0);

    expect(runReleaseCliArgs).toHaveBeenCalledWith(expect.arrayContaining([
      '--launchTime', '07:59:59',
      '-d', '07/13/2026',
      '-l', '14',
      '--sites', 'BH09',
      '--availabilitySnapshot', '/tmp/scout-snapshot.json',
      '--skipCartPreflight',
    ]));
  });
});
