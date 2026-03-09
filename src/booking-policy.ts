export function getConsecutiveCartFailureLimit(maxHolds: number, holdsCount: number): number {
  const remainingHolds = Math.max(maxHolds - holdsCount, 0);
  return Math.max(2, remainingHolds * 2);
}

export function shouldStopAccountAfterCartFailure(
  maxHolds: number,
  holdsCount: number,
  consecutiveCartFailures: number,
): boolean {
  if (holdsCount === 0) {
    return false;
  }

  return consecutiveCartFailures >= getConsecutiveCartFailureLimit(maxHolds, holdsCount);
}
