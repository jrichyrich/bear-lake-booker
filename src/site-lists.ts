import * as fs from 'fs';
import * as path from 'path';
import { findFirstSiteId, normalizeSiteId } from './site-id';

const SITE_LISTS_DIR = 'camp sites';

type RankedSiteSections = {
  topChoices: string[];
  backups: string[];
  exclude: string[];
};

export type LoadedSiteList = {
  siteIds: string[];
  sourcePath: string;
  topChoices: string[];
  backups: string[];
  exclude: string[];
};

function dedupeSiteIds(siteIds: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const siteId of siteIds) {
    const normalized = normalizeSiteId(siteId);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function normalizeSectionHeading(value: string): keyof RankedSiteSections | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'top choices') {
    return 'topChoices';
  }
  if (normalized === 'backups') {
    return 'backups';
  }
  if (normalized === 'exclude') {
    return 'exclude';
  }
  return null;
}

export function resolveSiteListPath(siteList: string, baseDir = path.resolve(process.cwd(), SITE_LISTS_DIR)): string {
  const trimmed = siteList.trim();
  if (!trimmed) {
    throw new Error('Site list name/path must not be empty.');
  }

  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith('.') || trimmed.includes('/') || trimmed.includes(path.sep)) {
    return path.resolve(process.cwd(), trimmed);
  }

  return path.resolve(baseDir, path.extname(trimmed) ? trimmed : `${trimmed}.md`);
}

export function parseRankedSiteList(content: string): RankedSiteSections {
  const sections: RankedSiteSections = {
    topChoices: [],
    backups: [],
    exclude: [],
  };
  let activeSection: keyof RankedSiteSections | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const headingMatch = /^#{1,6}\s+(.+)$/.exec(line);
    if (headingMatch) {
      activeSection = normalizeSectionHeading(headingMatch[1] ?? '');
      continue;
    }

    if (!activeSection || !line.startsWith('-')) {
      continue;
    }

    const siteId = findFirstSiteId(line);
    if (!siteId) {
      throw new Error(`Invalid site entry "${line}". Expected a bullet like "- BC85".`);
    }
    sections[activeSection].push(siteId);
  }

  return {
    topChoices: dedupeSiteIds(sections.topChoices),
    backups: dedupeSiteIds(sections.backups),
    exclude: dedupeSiteIds(sections.exclude),
  };
}

export function buildSiteAllowlist(sections: RankedSiteSections): string[] {
  const excluded = new Set(sections.exclude.map((siteId) => siteId.toUpperCase()));
  return dedupeSiteIds([...sections.topChoices, ...sections.backups]).filter(
    (siteId) => !excluded.has(siteId.toUpperCase()),
  );
}

export function loadSiteList(siteList: string, baseDir?: string): LoadedSiteList {
  const sourcePath = resolveSiteListPath(siteList, baseDir);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Site list not found: ${sourcePath}`);
  }

  const content = fs.readFileSync(sourcePath, 'utf-8');
  const sections = parseRankedSiteList(content);
  const siteIds = buildSiteAllowlist(sections);
  if (siteIds.length === 0) {
    throw new Error(`Site list ${sourcePath} does not contain any usable sites after exclusions.`);
  }

  return {
    siteIds,
    sourcePath,
    topChoices: sections.topChoices.filter((siteId) => siteIds.includes(siteId)),
    backups: sections.backups.filter((siteId) => siteIds.includes(siteId)),
    exclude: sections.exclude,
  };
}
