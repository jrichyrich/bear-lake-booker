import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildSiteAllowlist,
  loadSiteList,
  parseRankedSiteList,
  resolveSiteListPath,
} from '../src/site-lists';

describe('site lists', () => {
  test('parses top choices, backups, and exclude sections', () => {
    const sections = parseRankedSiteList(`
# Preferred Sites

## Top choices
- BH03
- bh09

## Backups
- BH11
- BH12

## Exclude
- BH31-HOST
`);

    expect(sections).toEqual({
      topChoices: ['BH03', 'BH09'],
      backups: ['BH11', 'BH12'],
      exclude: ['BH31-HOST'],
    });
  });

  test('builds an allowlist with order preserved and exclusions winning', () => {
    expect(buildSiteAllowlist({
      topChoices: ['BH03', 'BH09', 'BH11'],
      backups: ['BH11', 'BH12', 'BH13'],
      exclude: ['BH09', 'BH13'],
    })).toEqual(['BH03', 'BH11', 'BH12']);
  });

  test('resolves a named site list inside the camp sites directory', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bear-lake-site-lists-'));
    expect(resolveSiteListPath('preferred-sites', tempDir)).toBe(path.join(tempDir, 'preferred-sites.md'));
    expect(resolveSiteListPath('preferred-sites.md', tempDir)).toBe(path.join(tempDir, 'preferred-sites.md'));
  });

  test('loads a site list from markdown and returns ordered allowed sites', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bear-lake-site-lists-'));
    const siteListPath = path.join(tempDir, 'preferred-sites.md');
    fs.writeFileSync(siteListPath, `
# Preferred Sites

## Top choices
- BH03
- BH09

## Backups
- BH11
- BH12
- BH31-HOST

## Exclude
- BH31-HOST
`, 'utf-8');

    expect(loadSiteList('preferred-sites', tempDir)).toEqual({
      sourcePath: siteListPath,
      siteIds: ['BH03', 'BH09', 'BH11', 'BH12'],
    });
  });

  test('fails clearly for a missing site list', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bear-lake-site-lists-'));
    expect(() => loadSiteList('missing-list', tempDir)).toThrow('Site list not found');
  });

  test('fails clearly for an empty site list after exclusions', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bear-lake-site-lists-'));
    const siteListPath = path.join(tempDir, 'preferred-sites.md');
    fs.writeFileSync(siteListPath, `
## Top choices
- BH31-HOST

## Exclude
- BH31-HOST
`, 'utf-8');

    expect(() => loadSiteList('preferred-sites', tempDir)).toThrow('does not contain any usable sites');
  });
});
