import {
  assignPreferredSitesToAgents,
  filterTargetSiteIds,
  getInitialTargetSites,
  prioritizeAccountAwareTargetSiteIds,
  prioritizeTargetSiteIds,
} from '../src/site-targeting';

describe('site targeting helpers', () => {
  test('filters discovered sites against the allowlist', () => {
    expect(filterTargetSiteIds(['BH09', 'BH11', 'BH22'], ['BH11', 'BH22'])).toEqual(['BH11', 'BH22']);
  });

  test('keeps all discovered sites when no allowlist is provided', () => {
    expect(filterTargetSiteIds(['BH09', 'BH11'], [])).toEqual(['BH09', 'BH11']);
  });

  test('seeds timed launches with requested target sites', () => {
    expect(getInitialTargetSites('08:00:00', ['BH09', 'BH11'])).toEqual(['BH09', 'BH11']);
  });

  test('does not seed untimed launches with requested target sites', () => {
    expect(getInitialTargetSites(undefined, ['BH09', 'BH11'])).toEqual([]);
  });

  test('rotates site order for later agents when there is no preferred site', () => {
    expect(prioritizeTargetSiteIds(['BC85', 'BC86', 'BC87'], null, 1)).toEqual(['BC86', 'BC87', 'BC85']);
  });

  test('keeps the preferred site first while rotating the remaining sites', () => {
    expect(prioritizeTargetSiteIds(['BC85', 'BC86', 'BC87', 'BC88'], 'BC87', 1)).toEqual(['BC87', 'BC86', 'BC88', 'BC85']);
  });

  test('deduplicates site ids case-insensitively before prioritizing', () => {
    expect(prioritizeTargetSiteIds(['bc85', 'BC85', 'BC86'], null, 0)).toEqual(['bc85', 'BC86']);
  });

  test('assigns distinct preferred sites when enough targets exist for all agents', () => {
    expect(assignPreferredSitesToAgents(
      ['BH04', 'BH07', 'BH08', 'BH09', 'BH11', 'BH03'],
      [
        { accountKey: 'lisa', localAgentIndex: 1 },
        { accountKey: 'jason', localAgentIndex: 1 },
        { accountKey: 'lisa', localAgentIndex: 2 },
        { accountKey: 'jason', localAgentIndex: 2 },
        { accountKey: 'lisa', localAgentIndex: 3 },
        { accountKey: 'jason', localAgentIndex: 3 },
      ],
    )).toEqual(['BH04', 'BH07', 'BH08', 'BH09', 'BH11', 'BH03']);
  });

  test('prefers unused distinct sites before other-account pending or same-account assigned sites', () => {
    expect(prioritizeAccountAwareTargetSiteIds(
      ['BH03', 'BH04', 'BH07', 'BH08', 'BH09', 'BH11'],
      {
        preferredSite: null,
        rotationOffset: 0,
        accountAssignedSites: ['BH03', 'BH08'],
        accountAttemptedSites: [],
        accountFailedSites: [],
        accountReservedSites: [],
        otherAccountPendingSites: ['BH11'],
      },
    )).toEqual(['BH04', 'BH07', 'BH09', 'BH11', 'BH03', 'BH08']);
  });

  test('pushes failed or already-attempted sites to the end for later same-account holds', () => {
    expect(prioritizeAccountAwareTargetSiteIds(
      ['BH03', 'BH04', 'BH07', 'BH08'],
      {
        preferredSite: 'BH03',
        rotationOffset: 0,
        accountAssignedSites: ['BH03'],
        accountAttemptedSites: ['BH04'],
        accountFailedSites: ['BH08'],
        accountReservedSites: [],
        otherAccountPendingSites: [],
      },
    )).toEqual(['BH03', 'BH07', 'BH04', 'BH08']);
  });
});
