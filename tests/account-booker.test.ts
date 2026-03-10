import { AccountBooker, type CaptureAccount } from '../src/account-booker';

const account: CaptureAccount = {
  account: 'lisarichards1984@gmail.com',
  displayName: 'lisarichards1984@gmail.com',
  storageKey: 'lisarichards1984',
};

describe('AccountBooker', () => {
  test('serializes site reservations per account', () => {
    const booker = new AccountBooker(account, 2);

    expect(booker.reserveSite('BH03')).toBe(true);
    expect(booker.reserveSite('BH03')).toBe(false);

    booker.releaseSite('BH03');
    expect(booker.reserveSite('BH03')).toBe(true);
  });

  test('closes after reaching max holds', () => {
    const booker = new AccountBooker(account, 2);

    expect(booker.recordSuccess(1, 'BH03', 'order-details')).toEqual({ registered: true, shouldClose: false });
    expect(booker.recordSuccess(2, 'BH09', 'order-details')).toEqual({ registered: true, shouldClose: true });
    expect(booker.isClosed).toBe(true);
    expect(booker.winningAgentId).toBe(2);
    expect(booker.stopReason).toBe('max-holds-reached');
  });

  test('tracks failed sites and closes after repeated post-success failures', () => {
    const booker = new AccountBooker(account, 2);

    booker.recordSuccess(1, 'BH03', 'order-details');
    expect(booker.recordCartFailure(2, 'BH11')).toBe(false);
    expect(booker.hasFailedSite('BH11')).toBe(true);
    expect(booker.recordCartFailure(3, 'BH12')).toBe(true);
    expect(booker.isClosed).toBe(true);
    expect(booker.winningAgentId).toBeNull();
    expect(booker.stopReason).toBe('cart-failure-threshold');
  });

  test('tracks assigned and attempted sites for later account-aware planning', () => {
    const booker = new AccountBooker(account, 3);

    booker.markAssignedSite('BH03');
    booker.markAssignedSite('BH08');
    booker.markAttemptedSite('BH03');

    expect(Array.from(booker.assignedSites)).toEqual(['BH03', 'BH08']);
    expect(Array.from(booker.attemptedSites)).toEqual(['BH03']);
    expect(booker.getPendingAssignedSites()).toEqual(['BH03', 'BH08']);
  });

  test('closes when verified cart state reaches the max hold count', () => {
    const booker = new AccountBooker(account, 3);

    expect(booker.recordVerifiedCartSites(['BH04', 'BH08', 'BH11'])).toEqual({
      verifiedCount: 3,
      shouldClose: true,
    });
    expect(booker.isClosed).toBe(true);
    expect(booker.stopReason).toBe('verified-cart-cap');
  });

  test('records skip reasons for account summary telemetry', () => {
    const booker = new AccountBooker(account, 3);

    booker.recordSkip('BH11', 'already-reserved-for-account', 6);

    expect(booker.skipEvents).toHaveLength(1);
    expect(booker.skipEvents[0]).toMatchObject({
      site: 'BH11',
      reason: 'already-reserved-for-account',
      agentId: 6,
    });
  });
});
