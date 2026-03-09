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
