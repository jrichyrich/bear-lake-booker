export function buildBlitzUrl(detailsUrl: string, targetDate: string, stayLength: string): string {
  const separator = detailsUrl.includes('?') ? '&' : '?';
  return `${detailsUrl}${separator}arvdate=${encodeURIComponent(targetDate)}&lengthOfStay=${encodeURIComponent(stayLength)}`;
}
