import { filterTargetSiteIds, getInitialTargetSites } from '../src/site-targeting';

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
});
