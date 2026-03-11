import { rankRequestedSitesForCapture, type AvailabilitySnapshot } from './availability-snapshots';
import type { SearchResult } from './reserveamerica';
import type { LoadedSiteList } from './site-lists';

export type ReleaseSchedule = {
  launchAt: Date;
  warmupAt: Date;
  scoutAt: Date;
};

type ResolveReleaseScoutSitesInput = {
  explicitSites?: string[];
  search: SearchResult;
  availabilitySnapshot: AvailabilitySnapshot | null;
  loadedSiteList?: LoadedSiteList | null;
  desiredCount: number;
};

export function resolveProjectionAt(launchAt: Date, projectionLeadMinutes: number, warmupAt: Date): Date {
  if (projectionLeadMinutes < 0) {
    throw new Error('Projection lead time must be non-negative.');
  }

  const projectionAt = new Date(launchAt.getTime() - projectionLeadMinutes * 60_000);
  if (projectionAt.getTime() > warmupAt.getTime()) {
    throw new Error('Projection lead time must be greater than or equal to warmup lead time.');
  }

  return projectionAt;
}

function parseTimeParts(value: string): [number, number, number] {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid launch time "${value}". Expected HH:MM:SS.`);
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    throw new Error(`Invalid launch time "${value}". Expected HH:MM:SS.`);
  }

  return [hours, minutes, seconds];
}

export function resolveReleaseSchedule(
  now: Date,
  launchTime: string,
  scoutLeadMinutes: number,
  warmupLeadSeconds: number,
): ReleaseSchedule {
  if (scoutLeadMinutes < 0 || warmupLeadSeconds < 0) {
    throw new Error('Lead times must be non-negative.');
  }

  const [hours, minutes, seconds] = parseTimeParts(launchTime);
  const launchAt = new Date(now);
  launchAt.setHours(hours, minutes, seconds, 0);

  if (launchAt.getTime() <= now.getTime()) {
    throw new Error(`Launch time ${launchTime} is already in the past for today.`);
  }

  const scoutAt = new Date(launchAt.getTime() - scoutLeadMinutes * 60_000);
  const warmupAt = new Date(launchAt.getTime() - warmupLeadSeconds * 1000);

  if (scoutAt.getTime() > warmupAt.getTime()) {
    throw new Error('Scout lead time must be greater than or equal to warmup lead time.');
  }

  return { launchAt, warmupAt, scoutAt };
}

export function selectReleaseSites(
  availableSites: string[],
  desiredCount: number,
  explicitSites: string[] = [],
): string[] {
  const dedupedExplicit = Array.from(new Set(explicitSites.map((site) => site.trim().toUpperCase()).filter(Boolean)));
  if (dedupedExplicit.length > 0) {
    return dedupedExplicit;
  }

  if (desiredCount <= 0) {
    return [];
  }

  return Array.from(
    new Set(availableSites.map((site) => site.trim().toUpperCase()).filter(Boolean)),
  ).slice(0, desiredCount);
}

export function resolveReleaseScoutSites(input: ResolveReleaseScoutSitesInput): string[] {
  const explicitSites = input.explicitSites ?? [];
  if (explicitSites.length > 0) {
    return selectReleaseSites([], input.desiredCount, explicitSites);
  }

  const returnedSites = input.search.allSites.map((site) => site.site);
  const candidateSites = input.loadedSiteList
    ? returnedSites.filter((siteId) => input.loadedSiteList?.siteIds.includes(siteId.trim().toUpperCase()))
    : input.search.availableSites.length > 0
      ? input.search.availableSites.map((site) => site.site)
      : returnedSites;

  return selectReleaseSites(
    rankRequestedSitesForCapture(
      candidateSites,
      input.availabilitySnapshot,
      input.loadedSiteList,
    ),
    input.desiredCount,
  );
}

type StripOptionConfig = {
  name: string;
  takesValue: boolean;
};

const WRAPPER_ONLY_OPTIONS: StripOptionConfig[] = [
  { name: '--launchTime', takesValue: true },
  { name: '--scoutLeadMinutes', takesValue: true },
  { name: '--warmupLeadSeconds', takesValue: true },
  { name: '--projectionMode', takesValue: true },
  { name: '--projectionPolicy', takesValue: true },
  { name: '--projectionLeadMinutes', takesValue: true },
  { name: '--allowProjectionOutsideWindowEdge', takesValue: false },
  { name: '--notificationProfile', takesValue: true },
  { name: '--siteList', takesValue: true },
  { name: '--siteListSource', takesValue: true },
  { name: '--availabilitySnapshot', takesValue: true },
  { name: '--time', takesValue: true },
  { name: '-t', takesValue: true },
  { name: '--sites', takesValue: true },
];

export function buildReleaseRaceArgs(
  originalArgs: string[],
  launchTime: string,
  sites: string[],
  notificationProfile: 'test' | 'production',
  siteListSource?: string,
  availabilitySnapshot?: string,
): string[] {
  const stripped: string[] = [];

  for (let index = 0; index < originalArgs.length; index += 1) {
    const current = originalArgs[index]!;
    const option = WRAPPER_ONLY_OPTIONS.find((candidate) => candidate.name === current);
    if (!option) {
      stripped.push(current);
      continue;
    }

    if (option.takesValue) {
      index += 1;
    }
  }

  return [
    ...stripped,
    '--time',
    launchTime,
    '--notificationProfile',
    notificationProfile,
    ...(siteListSource ? ['--siteListSource', siteListSource] : []),
    ...(availabilitySnapshot ? ['--availabilitySnapshot', availabilitySnapshot] : []),
    ...(sites.length > 0 ? ['--sites', sites.join(',')] : []),
  ];
}
