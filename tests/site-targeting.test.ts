import { filterTargetSiteIds, getInitialTargetSites, prioritizeTargetSiteIds } from '../src/site-targeting';

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
});
