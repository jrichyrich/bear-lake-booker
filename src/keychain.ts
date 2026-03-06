import { execFileSync } from 'child_process';
import { DEFAULT_ACCOUNT } from './config';

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
    const password = execFileSync('security', [
      'find-generic-password',
      '-s', service,
      '-a', account,
      '-w'
    ], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], // Ignore stderr to avoid noise if not found
    }).trim();

    return password;
  } catch (error) {
    return undefined;
  }
}

/**
 * Securely stores a password in the macOS Keychain for a given service and account.
 * Uses -U to update existing entries.
 */
export function setPassword(service: string, account: string, password: string) {
  try {
    execFileSync('security', [
      'add-generic-password',
      '-a', account,
      '-s', service,
      '-w', password,
      '-U'
    ]);
    return true;
  } catch (error) {
    console.error(`Failed to save password to keychain: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Retrieves the ReserveAmerica credentials from the keychain.
 * Defaults to the account from config.
 */
export function getReserveAmericaCredentials(account = DEFAULT_ACCOUNT): Credentials {
  const password = getPassword('ReserveAmerica', account);
  return {
    username: account,
    password,
  };
}

/**
 * Saves ReserveAmerica credentials to the keychain.
 */
export function saveReserveAmericaCredentials(password: string, account = DEFAULT_ACCOUNT) {
  return setPassword('ReserveAmerica', account, password);
}
