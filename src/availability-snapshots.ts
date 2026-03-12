import * as fs from 'fs';
import * as path from 'path';
import type { SiteCalendarResult } from './site-calendar';
import type { LoadedSiteList } from './site-lists';

const SNAPSHOTS_DIR = path.resolve(process.cwd(), 'camp sites', 'availability');

export type AvailabilitySnapshot = {
  generatedAt: string;
  searchedAt: string;
  snapshotKind?: 'site-calendar' | 'projection';
  loop: string;
  stayLength: string;
  seedDate: string;
  dateTo?: string;
  requestedSites: string[];
  missingSites: string[];
  siteListSource?: string;
  results: SiteCalendarResult[];
};

export type SnapshotSiteStrength = {
  site: string;
  firstAvailableDate?: string;
  firstFutureAvailableDate?: string;
  maxConsecutiveNights: number;
  maxFutureConsecutiveNights: number;
  availableDayCount: number;
  futureAvailableDayCount: number;
  availabilityDensity: number;
  futureAvailabilityDensity: number;
};

function parseSlashDate(value: string): Date {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid date "${value}". Expected MM/DD/YYYY.`);
  }

  return new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
}

function compareSlashDates(left: string, right: string): number {
  return parseSlashDate(left).getTime() - parseSlashDate(right).getTime();
}

function slashDateForFilename(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid date "${value}". Expected MM/DD/YYYY.`);
  }

  return `${match[3]}-${match[1]}-${match[2]}`;
}

function normalizeTimestamp(value: string): string {
  return value.replace(/[:.]/g, '-');
}

function normalizeSiteId(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeSnapshot(raw: Partial<AvailabilitySnapshot> & { searchedAt?: string }): AvailabilitySnapshot {
  const generatedAt = raw.generatedAt ?? raw.searchedAt;
  if (!generatedAt) {
    throw new Error('Availability snapshot is missing generatedAt/searchedAt.');
  }

  return {
    generatedAt,
    searchedAt: raw.searchedAt ?? generatedAt,
    ...(raw.snapshotKind ? { snapshotKind: raw.snapshotKind } : {}),
    loop: raw.loop ?? '',
    stayLength: raw.stayLength ?? '',
    seedDate: raw.seedDate ?? '',
    requestedSites: raw.requestedSites ?? [],
    missingSites: raw.missingSites ?? [],
    results: raw.results ?? [],
    ...(raw.dateTo ? { dateTo: raw.dateTo } : {}),
    ...(raw.siteListSource ? { siteListSource: raw.siteListSource } : {}),
  };
}

export function getAvailabilitySnapshotsDir(): string {
  return SNAPSHOTS_DIR;
}

export function buildAvailabilitySnapshotPath(snapshot: AvailabilitySnapshot): string {
  const loop = snapshot.loop.trim().toLowerCase();
  const start = slashDateForFilename(snapshot.seedDate);
  const end = slashDateForFilename(snapshot.dateTo ?? snapshot.seedDate);
  const generated = normalizeTimestamp(snapshot.generatedAt);
  return path.join(getAvailabilitySnapshotsDir(), `${loop}-${start}-${end}-${generated}.json`);
}

export function writeAvailabilitySnapshot(snapshot: AvailabilitySnapshot, outputPath?: string): string {
  const normalized = normalizeSnapshot(snapshot);
  const resolvedPath = outputPath
    ? path.resolve(outputPath)
    : buildAvailabilitySnapshotPath(normalized);

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf-8');
  return resolvedPath;
}

export function loadAvailabilitySnapshot(snapshotPath: string): AvailabilitySnapshot {
  const resolvedPath = path.resolve(snapshotPath);
  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = JSON.parse(content) as Partial<AvailabilitySnapshot>;
  if (!parsed.loop || !parsed.stayLength || !parsed.seedDate || !Array.isArray(parsed.results)) {
    throw new Error(`File is not a valid availability snapshot: ${resolvedPath}`);
  }
  return normalizeSnapshot(parsed as AvailabilitySnapshot);
}

function isDateInSnapshot(snapshot: AvailabilitySnapshot, targetDate: string): boolean {
  if (compareSlashDates(targetDate, snapshot.seedDate) < 0) {
    return false;
  }

  if (!snapshot.dateTo) {
    return compareSlashDates(targetDate, snapshot.seedDate) === 0;
  }

  return compareSlashDates(targetDate, snapshot.dateTo) <= 0;
}

function findLatestAvailabilitySnapshot(options: {
  loop?: string;
  stayLength?: string;
  targetDate?: string;
  siteListSource?: string;
  snapshotKind?: AvailabilitySnapshot['snapshotKind'];
  snapshotsDir?: string;
}): { snapshotPath: string; snapshot: AvailabilitySnapshot } | null {
  const snapshotsDir = options.snapshotsDir
    ? path.resolve(options.snapshotsDir)
    : getAvailabilitySnapshotsDir();
  if (!fs.existsSync(snapshotsDir)) {
    return null;
  }

  const snapshotPaths = fs.readdirSync(snapshotsDir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => path.join(snapshotsDir, entry));

  const matches = snapshotPaths
    .map((snapshotPath) => {
      try {
        return { snapshotPath, snapshot: loadAvailabilitySnapshot(snapshotPath) };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { snapshotPath: string; snapshot: AvailabilitySnapshot } => entry !== null)
    .filter(({ snapshot }) => {
      if (options.loop && snapshot.loop.toUpperCase() !== options.loop.toUpperCase()) {
        return false;
      }
      if (options.stayLength && snapshot.stayLength !== options.stayLength) {
        return false;
      }
      if (options.siteListSource && snapshot.siteListSource !== options.siteListSource) {
        return false;
      }
      if (options.snapshotKind) {
        if (options.snapshotKind === 'site-calendar') {
          if (snapshot.snapshotKind && snapshot.snapshotKind !== 'site-calendar') {
            return false;
          }
        } else if (snapshot.snapshotKind !== options.snapshotKind) {
          return false;
        }
      }
      if (options.targetDate && !isDateInSnapshot(snapshot, options.targetDate)) {
        return false;
      }
      return true;
    })
    .sort((left, right) => new Date(right.snapshot.generatedAt).getTime() - new Date(left.snapshot.generatedAt).getTime());

  return matches[0] ?? null;
}

export function resolveLatestAvailabilitySnapshotPath(options: {
  loop?: string;
  stayLength?: string;
  targetDate?: string;
  siteListSource?: string;
  snapshotKind?: AvailabilitySnapshot['snapshotKind'];
  snapshotsDir?: string;
}): string | null {
  return findLatestAvailabilitySnapshot(options)?.snapshotPath ?? null;
}

export function loadLatestAvailabilitySnapshot(options: {
  loop?: string;
  stayLength?: string;
  targetDate?: string;
  siteListSource?: string;
  snapshotKind?: AvailabilitySnapshot['snapshotKind'];
  snapshotsDir?: string;
}): AvailabilitySnapshot | null {
  return findLatestAvailabilitySnapshot(options)?.snapshot ?? null;
}

export function buildSnapshotSiteStrengths(snapshot: AvailabilitySnapshot): Map<string, SnapshotSiteStrength> {
  return new Map(
    snapshot.results.map((result) => {
      const availableDayCount = result.days.filter((day) => day.reservable).length;
      const futureAvailableDayCount = result.days.filter((day) => day.futureReservable).length;
      const availabilityDensity = result.days.length > 0 ? availableDayCount / result.days.length : 0;
      const futureAvailabilityDensity = result.days.length > 0 ? futureAvailableDayCount / result.days.length : 0;
      return [
        normalizeSiteId(result.site),
        {
          site: normalizeSiteId(result.site),
          ...(result.firstAvailableDate ? { firstAvailableDate: result.firstAvailableDate } : {}),
          ...(result.firstFutureAvailableDate ? { firstFutureAvailableDate: result.firstFutureAvailableDate } : {}),
          maxConsecutiveNights: result.maxConsecutiveNights,
          maxFutureConsecutiveNights: result.maxFutureConsecutiveNights,
          availableDayCount,
          futureAvailableDayCount,
          availabilityDensity,
          futureAvailabilityDensity,
        },
      ];
    }),
  );
}

function compareStrength(
  left: SnapshotSiteStrength | undefined,
  right: SnapshotSiteStrength | undefined,
): number {
  const leftScore = left?.maxConsecutiveNights ?? -1;
  const rightScore = right?.maxConsecutiveNights ?? -1;
  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  const leftDays = left?.availableDayCount ?? -1;
  const rightDays = right?.availableDayCount ?? -1;
  if (rightDays !== leftDays) {
    return rightDays - leftDays;
  }

  const leftFutureScore = left?.maxFutureConsecutiveNights ?? -1;
  const rightFutureScore = right?.maxFutureConsecutiveNights ?? -1;
  if (rightFutureScore !== leftFutureScore) {
    return rightFutureScore - leftFutureScore;
  }

  const leftFutureDays = left?.futureAvailableDayCount ?? -1;
  const rightFutureDays = right?.futureAvailableDayCount ?? -1;
  if (rightFutureDays !== leftFutureDays) {
    return rightFutureDays - leftFutureDays;
  }

  const leftDensity = left?.availabilityDensity ?? -1;
  const rightDensity = right?.availabilityDensity ?? -1;
  if (rightDensity !== leftDensity) {
    return rightDensity > leftDensity ? 1 : -1;
  }

  const leftFutureDensity = left?.futureAvailabilityDensity ?? -1;
  const rightFutureDensity = right?.futureAvailabilityDensity ?? -1;
  if (rightFutureDensity !== leftFutureDensity) {
    return rightFutureDensity > leftFutureDensity ? 1 : -1;
  }

  if (left?.firstAvailableDate && right?.firstAvailableDate) {
    return compareSlashDates(left.firstAvailableDate, right.firstAvailableDate);
  }

  if (left?.firstAvailableDate) {
    return -1;
  }

  if (right?.firstAvailableDate) {
    return 1;
  }

  if (left?.firstFutureAvailableDate && right?.firstFutureAvailableDate) {
    return compareSlashDates(left.firstFutureAvailableDate, right.firstFutureAvailableDate);
  }

  if (left?.firstFutureAvailableDate) {
    return -1;
  }

  if (right?.firstFutureAvailableDate) {
    return 1;
  }

  return 0;
}

export function rankSiteIdsWithSnapshot(siteIds: string[], snapshot: AvailabilitySnapshot | null): string[] {
  const normalized = Array.from(new Set(siteIds.map(normalizeSiteId).filter(Boolean)));
  if (!snapshot || normalized.length <= 1) {
    return normalized;
  }

  const strengths = buildSnapshotSiteStrengths(snapshot);
  return normalized
    .map((siteId, index) => ({ siteId, index, strength: strengths.get(siteId) }))
    .sort((left, right) => {
      const strengthOrder = compareStrength(left.strength, right.strength);
      if (strengthOrder !== 0) {
        return strengthOrder;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.siteId);
}

export function rankRequestedSitesForCapture(
  siteIds: string[],
  snapshot: AvailabilitySnapshot | null,
  loadedSiteList?: LoadedSiteList | null,
): string[] {
  const normalized = Array.from(new Set(siteIds.map(normalizeSiteId).filter(Boolean)));
  if (!snapshot || normalized.length <= 1) {
    return normalized;
  }

  if (!loadedSiteList) {
    return rankSiteIdsWithSnapshot(normalized, snapshot);
  }

  const topChoices = rankSiteIdsWithSnapshot(
    loadedSiteList.topChoices.filter((siteId) => normalized.includes(siteId)),
    snapshot,
  );
  const backups = rankSiteIdsWithSnapshot(
    loadedSiteList.backups.filter((siteId) => normalized.includes(siteId)),
    snapshot,
  );
  const remainder = rankSiteIdsWithSnapshot(
    normalized.filter((siteId) => !topChoices.includes(siteId) && !backups.includes(siteId)),
    snapshot,
  );
  return [...topChoices, ...backups, ...remainder];
}
