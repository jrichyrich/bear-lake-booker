import { normalizeCliAccounts } from '../src/session-utils';

describe('normalizeCliAccounts', () => {
  test('warns when shorthand aliases are expanded', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    expect(normalizeCliAccounts(['lisa', 'default', 'jason@gmail.com'], '[Test] ')).toEqual([
      'lisa@gmail.com',
      'default',
      'jason@gmail.com',
    ]);
    expect(warnSpy).toHaveBeenCalledWith(
      '[Test] Account "lisa" resolved to "lisa@gmail.com". Prefer using full email addresses.',
    );

    warnSpy.mockRestore();
  });
});
