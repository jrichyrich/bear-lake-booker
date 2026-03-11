import {
  buildReleaseRaceArgs,
  resolveReleaseSchedule,
  selectReleaseSites,
} from '../src/release-utils';

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

  test('explicit site overrides are preserved as-is', () => {
    expect(selectReleaseSites(['BH03', 'BH09', 'BH11'], 2, ['bh22', 'BH24'])).toEqual(['BH22', 'BH24']);
  });

  test('scout selection freezes the top sites up to the desired count', () => {
    expect(selectReleaseSites(['BH03', 'BH09', 'BH11'], 2)).toEqual(['BH03', 'BH09']);
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
      '-d', '05/22/2026',
      '--book',
    ], '07:59:59', ['BH03', 'BH09'], 'test', '/repo/camp sites/preferred-sites.md')).toEqual([
      '-d', '05/22/2026',
      '--book',
      '--time', '07:59:59',
      '--notificationProfile', 'test',
      '--siteListSource', '/repo/camp sites/preferred-sites.md',
      '--sites', 'BH03,BH09',
    ]);
  });
});
