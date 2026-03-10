export function filterTargetSiteIds(siteIds: string[], allowlist: string[]): string[] {
  if (allowlist.length === 0) {
    return siteIds;
  }

  const allowlistSet = new Set(allowlist.map((site) => site.toUpperCase()));
  return siteIds.filter((site) => allowlistSet.has(site.toUpperCase()));
}

export function getInitialTargetSites(targetTime: string | undefined, allowlist: string[]): string[] {
  if (!targetTime || allowlist.length === 0) {
    return [];
  }

  return [...allowlist];
}

export type PreferredSiteAssignmentAgent = {
  accountKey: string;
  localAgentIndex: number;
};

export type AccountAwareSiteOrderOptions = {
  preferredSite: string | null;
  rotationOffset?: number;
  accountAssignedSites?: string[];
  accountAttemptedSites?: string[];
  accountFailedSites?: string[];
  accountReservedSites?: string[];
  otherAccountPendingSites?: string[];
};

function dedupeSiteIds(siteIds: string[]): string[] {
  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const siteId of siteIds) {
    const normalized = siteId.toUpperCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(siteId);
  }

  return deduped;
}

function rotate(values: string[], offset: number): string[] {
  if (values.length <= 1) {
    return values;
  }

  const normalizedOffset = ((offset % values.length) + values.length) % values.length;
  if (normalizedOffset === 0) {
    return values;
  }

  return values.slice(normalizedOffset).concat(values.slice(0, normalizedOffset));
}

export function assignPreferredSitesToAgents(
  siteIds: string[],
  agents: PreferredSiteAssignmentAgent[],
): Array<string | null> {
  const deduped = dedupeSiteIds(siteIds);
  if (deduped.length === 0) {
    return agents.map(() => null);
  }

  if (deduped.length >= agents.length) {
    return agents.map((_, index) => deduped[index] ?? null);
  }

  return agents.map((agent, index) => {
    const accountOffset = Math.max(agent.localAgentIndex - 1, 0);
    const rotated = rotate(deduped, index + accountOffset);
    return rotated[0] ?? null;
  });
}

export function prioritizeAccountAwareTargetSiteIds(
  siteIds: string[],
  options: AccountAwareSiteOrderOptions,
): string[] {
  const deduped = dedupeSiteIds(siteIds);
  if (deduped.length <= 1) {
    return deduped;
  }

  const rotationOffset = options.rotationOffset ?? 0;
  const assignedSites = new Set((options.accountAssignedSites ?? []).map((siteId) => siteId.toUpperCase()));
  const attemptedSites = new Set((options.accountAttemptedSites ?? []).map((siteId) => siteId.toUpperCase()));
  const failedSites = new Set((options.accountFailedSites ?? []).map((siteId) => siteId.toUpperCase()));
  const reservedSites = new Set((options.accountReservedSites ?? []).map((siteId) => siteId.toUpperCase()));
  const otherPendingSites = new Set((options.otherAccountPendingSites ?? []).map((siteId) => siteId.toUpperCase()));

  const preferredIndex = options.preferredSite
    ? deduped.findIndex((siteId) => siteId.toUpperCase() === options.preferredSite!.toUpperCase())
    : -1;
  const preferred = preferredIndex >= 0 ? deduped[preferredIndex] ?? null : null;

  const bucketFresh: string[] = [];
  const bucketCrossAccountPending: string[] = [];
  const bucketAssignedToAccount: string[] = [];
  const bucketRecoveredFallback: string[] = [];

  for (const siteId of deduped) {
    if (preferred && siteId.toUpperCase() === preferred.toUpperCase()) {
      continue;
    }

    const normalized = siteId.toUpperCase();
    if (failedSites.has(normalized) || reservedSites.has(normalized) || attemptedSites.has(normalized)) {
      bucketRecoveredFallback.push(siteId);
      continue;
    }

    if (assignedSites.has(normalized)) {
      bucketAssignedToAccount.push(siteId);
      continue;
    }

    if (otherPendingSites.has(normalized)) {
      bucketCrossAccountPending.push(siteId);
      continue;
    }

    bucketFresh.push(siteId);
  }

  const ordered = [
    ...(preferred ? [preferred] : []),
    ...rotate(bucketFresh, rotationOffset),
    ...rotate(bucketCrossAccountPending, rotationOffset),
    ...rotate(bucketAssignedToAccount, rotationOffset),
    ...rotate(bucketRecoveredFallback, rotationOffset),
  ];

  return dedupeSiteIds(ordered);
}

export function prioritizeTargetSiteIds(
  siteIds: string[],
  preferredSite: string | null,
  rotationOffset = 0,
): string[] {
  return prioritizeAccountAwareTargetSiteIds(siteIds, {
    preferredSite,
    rotationOffset,
  });
}
