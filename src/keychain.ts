import { execSync } from 'child_process';

export interface Credentials {
  username: string;
  password?: string | undefined;
}

/**
 * Retrieves a password from the macOS Keychain for a given service and account.
 * 
 * @param service The service name (e.g., "ReserveAmerica")
 * @param account The account name (e.g., "user@example.com")
 * @returns The password string if found, or undefined if not.
 */
export function getPassword(service: string, account: string): string | undefined {
  try {
    // -w: only output the password
    // -s: service name
    // -a: account name
    const password = execSync(`security find-generic-password -s "${service}" -a "${account}" -w`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], // Ignore stderr to avoid noise if not found
    }).trim();

    return password;
  } catch (error) {
    return undefined;
  }
}

/**
 * Retrieves the ReserveAmerica credentials from the keychain.
 * Defaults to the account 'lisarichards1984@gmail.com' and service 'ReserveAmerica'.
 */
export function getReserveAmericaCredentials(account = 'lisarichards1984@gmail.com'): Credentials {
  const password = getPassword('ReserveAmerica', account);
  return {
    username: account,
    password,
  };
}
