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
  });

  test('tracks failed sites and closes after repeated post-success failures', () => {
    const booker = new AccountBooker(account, 2);

    booker.recordSuccess(1, 'BH03', 'order-details');
    expect(booker.recordCartFailure(2, 'BH11')).toBe(false);
    expect(booker.hasFailedSite('BH11')).toBe(true);
    expect(booker.recordCartFailure(3, 'BH12')).toBe(true);
    expect(booker.isClosed).toBe(true);
    expect(booker.winningAgentId).toBeNull();
  });
});
