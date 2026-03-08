import { sleep } from './automation';

/**
 * Parses a HH:MM:SS string into a Date object for today.
 */
export function parseTargetTime(targetTimeStr: string): Date {
  const [hours = 0, minutes = 0, seconds = 0] = targetTimeStr.split(':').map(Number);
  const target = new Date();
  target.setHours(hours, minutes, seconds, 0);
  return target;
}

/**
 * Returns milliseconds until the target time.
 */
export function msUntilTargetTime(targetTimeStr: string): number {
  const target = parseTargetTime(targetTimeStr);
  return target.getTime() - Date.now();
}

/**
 * High-resolution wait using performance.now() for sub-ms precision.
 * Switches from sleep-based polling to busy-wait in the final 200ms.
 */
export async function waitForTargetTime(targetTimeStr: string) {
  const target = parseTargetTime(targetTimeStr);
  console.log(`Waiting for ${targetTimeStr} (${target.toLocaleTimeString()})...`);

  // Coarse wait: sleep in 500ms intervals until 200ms before target
  while (true) {
    const remaining = target.getTime() - Date.now();
    if (remaining <= 200) break;
    await sleep(Math.min(remaining - 200, 500));
  }

  // Fine wait: busy-wait for the final 200ms
  while (Date.now() < target.getTime()) {
    // spin
  }

  console.log(`🔥 Firing now! (${new Date().toISOString()})`);
}

/**
 * Asserts that the current time is past the booking window open threshold
 * for a given target date. The threshold is 4 months prior at 8:00 AM.
 * 
 * E.g. Target date 08/15/2026 opens on 04/15/2026 at 8:00 AM.
 */
export function assertBookingWindow(targetDateStr: string) {
  const [monthStr, dayStr, yearStr] = targetDateStr.split('/');
  if (!monthStr || !dayStr || !yearStr) {
    throw new Error(`Invalid date format for ${targetDateStr}. Expected MM/DD/YYYY.`);
  }
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const year = parseInt(yearStr, 10);

  // Calculate 4 months prior, at 8:00 AM local time (Mountain Time)
  const windowOpenDate = new Date(year, month - 1 - 4, day, 8, 0, 0);
  const now = new Date();

  if (now < windowOpenDate) {
    throw new Error(`The booking window for ${targetDateStr} has not opened yet. It opens on ${windowOpenDate.toLocaleString()} (4 months prior at 8:00 AM).`);
  }
}
