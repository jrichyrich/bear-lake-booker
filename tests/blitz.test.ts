import { buildBlitzUrl } from '../src/blitz-utils';

describe('buildBlitzUrl', () => {
  it('appends arvdate and lengthOfStay to a base detailsUrl', () => {
    const base = 'https://utahstateparks.reserveamerica.com/camping/bear-lake-state-park/r/campsiteDetails.do?siteId=6780&contractCode=UT&parkId=343061';
    const result = buildBlitzUrl(base, '07/20/2026', '9');
    expect(result).toBe(`${base}&arvdate=07%2F20%2F2026&lengthOfStay=9`);
  });

  it('uses ? when base URL has no query params', () => {
    const base = 'https://example.com/campsiteDetails.do';
    const result = buildBlitzUrl(base, '07/20/2026', '9');
    expect(result).toBe('https://example.com/campsiteDetails.do?arvdate=07%2F20%2F2026&lengthOfStay=9');
  });

  it('encodes special characters in date', () => {
    const base = 'https://example.com/details?siteId=123';
    const result = buildBlitzUrl(base, '07/20/2026', '14');
    expect(result).toContain('arvdate=07%2F20%2F2026');
    expect(result).toContain('lengthOfStay=14');
  });
});
