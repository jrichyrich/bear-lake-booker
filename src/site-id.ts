const SITE_ID_PATTERN = /[A-Z]{2}\d{2,3}(?:-HOST)?/g;

export function normalizeSiteId(value: string): string {
  return value.trim().toUpperCase();
}

export function extractSiteIds(value: string): string[] {
  const matches = normalizeSiteId(value).match(SITE_ID_PATTERN) ?? [];
  return Array.from(new Set(matches.map((match) => normalizeSiteId(match)).filter(Boolean)));
}

export function findFirstSiteId(value: string): string | null {
  return extractSiteIds(value)[0] ?? null;
}
