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

export function prioritizeTargetSiteIds(
  siteIds: string[],
  preferredSite: string | null,
  rotationOffset = 0,
): string[] {
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

  if (deduped.length <= 1) {
    return deduped;
  }

  const preferredIndex = preferredSite
    ? deduped.findIndex((siteId) => siteId.toUpperCase() === preferredSite.toUpperCase())
    : -1;

  const rotate = (values: string[], offset: number): string[] => {
    if (values.length <= 1) {
      return values;
    }

    const normalizedOffset = ((offset % values.length) + values.length) % values.length;
    if (normalizedOffset === 0) {
      return values;
    }

    return values.slice(normalizedOffset).concat(values.slice(0, normalizedOffset));
  };

  if (preferredIndex >= 0) {
    const preferred = deduped[preferredIndex]!;
    const remainder = deduped.filter((siteId) => siteId.toUpperCase() !== preferred.toUpperCase());
    return [preferred, ...rotate(remainder, rotationOffset)];
  }

  return rotate(deduped, rotationOffset);
}
