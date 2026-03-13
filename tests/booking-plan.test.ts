import { buildGuidedBookingPlan } from '../src/booking-plan';
import type { ArrivalShortlist } from '../src/arrival-shortlists';

function makeShortlist(): ArrivalShortlist {
  return {
    generatedAt: '2026-03-13T15:00:00.000Z',
    targetDate: '07/13/2026',
    stayLength: '14',
    loop: 'BIRCH',
    sourceSnapshotGeneratedAt: '2026-03-13T14:59:00.000Z',
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
        stayWindowStatuses: ['A', 'a', 'a'],
        sourceSnapshotPath: '/tmp/scout-snapshot.json',
        sourceGeneratedAt: '2026-03-13T14:59:00.000Z',
      },
      {
        site: 'BH11',
        siteId: '11',
        detailsUrl: 'https://example.com/bh11',
        targetDate: '07/13/2026',
        stayLength: '14',
        fit: 'exact',
        arrivalStatus: 'A',
        stayWindowStatuses: ['A', 'a', 'a'],
        sourceSnapshotPath: '/tmp/scout-snapshot.json',
        sourceGeneratedAt: '2026-03-13T14:59:00.000Z',
      },
      {
        site: 'BH45',
        siteId: '45',
        detailsUrl: 'https://example.com/bh45',
        targetDate: '07/13/2026',
        stayLength: '14',
        fit: 'blocked',
        arrivalStatus: 'X',
        stayWindowStatuses: ['X', 'X', 'X'],
        sourceSnapshotPath: '/tmp/scout-snapshot.json',
        sourceGeneratedAt: '2026-03-13T14:59:00.000Z',
      },
    ],
  };
}

describe('guided booking plan', () => {
  test('uses exact-fit shortlist targets as the armed booking site list', () => {
    const plan = buildGuidedBookingPlan('/tmp/arrival-shortlist.json', makeShortlist());

    expect(plan.shortlistPath).toBe('/tmp/arrival-shortlist.json');
    expect(plan.sourceSnapshotPath).toBe('/tmp/scout-snapshot.json');
    expect(plan.siteIds).toEqual(['BH09', 'BH11']);
    expect(plan.exactTargets.map((target) => [target.site, target.detailsUrl])).toEqual([
      ['BH09', 'https://example.com/bh09'],
      ['BH11', 'https://example.com/bh11'],
    ]);
  });
});
