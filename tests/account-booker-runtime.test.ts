import { AccountBookerRuntime } from '../src/account-booker-runtime';
import { AccountBooker, type CaptureAccount } from '../src/account-booker';
import { getSessionPath } from '../src/session-utils';

const account: CaptureAccount = {
  account: 'testuser@gmail.com',
  displayName: 'testuser@gmail.com',
  storageKey: 'testuser',
};

describe('AccountBookerRuntime', () => {
  describe('saveSession', () => {
    test('writes storage state to the correct session path', async () => {
      const mockStorageState = jest.fn().mockResolvedValue({});
      const mockContext = {
        storageState: mockStorageState,
        newPage: jest.fn(),
        close: jest.fn(),
      } as any;

      const booker = new AccountBooker(account, 1);
      const runtime = new AccountBookerRuntime(booker, mockContext, account.account);

      await runtime.saveSession();

      const expectedPath = getSessionPath('testuser@gmail.com');
      expect(mockStorageState).toHaveBeenCalledWith({ path: expectedPath });
    });

    test('does not throw when storageState fails', async () => {
      const mockContext = {
        storageState: jest.fn().mockRejectedValue(new Error('context closed')),
        newPage: jest.fn(),
        close: jest.fn(),
      } as any;

      const booker = new AccountBooker(account, 1);
      const runtime = new AccountBookerRuntime(booker, mockContext, account.account);

      await expect(runtime.saveSession()).resolves.not.toThrow();
    });

    test('uses default session path when no account is provided', async () => {
      const defaultAccount: CaptureAccount = {
        account: undefined,
        displayName: 'default',
        storageKey: 'default',
      };
      const mockStorageState = jest.fn().mockResolvedValue({});
      const mockContext = {
        storageState: mockStorageState,
        newPage: jest.fn(),
        close: jest.fn(),
      } as any;

      const booker = new AccountBooker(defaultAccount, 1);
      const runtime = new AccountBookerRuntime(booker, mockContext, undefined);

      await runtime.saveSession();

      const expectedPath = getSessionPath(undefined);
      expect(mockStorageState).toHaveBeenCalledWith({ path: expectedPath });
    });
  });
});
