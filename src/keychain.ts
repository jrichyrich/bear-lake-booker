import { execFileSync } from 'child_process';
import { DEFAULT_ACCOUNT } from './config';

export interface Credentials {
  username: string;
  password?: string | undefined;
}

/**
 * Helper to run the macOS 'security' command.
 */
function runSecurityCmd(args: string[], options: any = {}): string {
  try {
    return execFileSync('security', args, {
      encoding: 'utf8',
      ...options,
    }).trim();
  } catch (error) {
    throw error;
  }
}

/**
 * Retrieves a password from the macOS Keychain for a given service and account.
 */
export function getPassword(service: string, account: string): string | undefined {
  try {
    // -w: only output the password
    return runSecurityCmd(['find-generic-password', '-s', service, '-a', account, '-w'], {
      stdio: ['ignore', 'pipe', 'ignore'], // Ignore stderr to avoid noise if not found
    });
  } catch {
    return undefined;
  }
}

/**
 * Securely stores a password in the macOS Keychain for a given service and account.
 */
export function setPassword(service: string, account: string, password: string): boolean {
  try {
    runSecurityCmd(['add-generic-password', '-a', account, '-s', service, '-w', password, '-U']);
    return true;
  } catch (error) {
    console.error(`Failed to save password to keychain: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Deletes a password from the macOS Keychain for a given service and account.
 */
export function deletePassword(service: string, account: string): boolean {
  try {
    runSecurityCmd(['delete-generic-password', '-a', account, '-s', service]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Retrieves the ReserveAmerica credentials from the keychain.
 */
export function getReserveAmericaCredentials(account = DEFAULT_ACCOUNT): Credentials {
  const password = getPassword('ReserveAmerica', account);
  return { username: account, password };
}

/**
 * Saves ReserveAmerica credentials to the keychain.
 */
export function saveReserveAmericaCredentials(password: string, account = DEFAULT_ACCOUNT): boolean {
  return setPassword('ReserveAmerica', account, password);
}

/**
 * Deletes ReserveAmerica credentials from the keychain.
 */
export function deleteReserveAmericaCredentials(account = DEFAULT_ACCOUNT): boolean {
  return deletePassword('ReserveAmerica', account);
}
