import { getConsecutiveCartFailureLimit, shouldStopAccountAfterCartFailure } from '../src/booking-policy';

describe('booking policy', () => {
  test('allows more retries when more holds remain', () => {
    expect(getConsecutiveCartFailureLimit(3, 1)).toBe(4);
    expect(getConsecutiveCartFailureLimit(2, 1)).toBe(2);
  });

  test('does not stop the first-hold chase on cart failures alone', () => {
    expect(shouldStopAccountAfterCartFailure(2, 0, 10)).toBe(false);
  });

  test('stops additional holds after repeated consecutive cart failures', () => {
    expect(shouldStopAccountAfterCartFailure(2, 1, 1)).toBe(false);
    expect(shouldStopAccountAfterCartFailure(2, 1, 2)).toBe(true);
    expect(shouldStopAccountAfterCartFailure(3, 1, 3)).toBe(false);
    expect(shouldStopAccountAfterCartFailure(3, 1, 4)).toBe(true);
  });
});
