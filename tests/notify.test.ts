import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  buildIMessageAppleScript,
  buildFinalInventorySummary,
  loadIMessageRecipients,
  normalizeIMessageRecipient,
  normalizeNotificationProfile,
} from '../src/notify';
import { type RunSummary } from '../src/reporter';

function buildSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    timestamp: '2026-03-10T17:15:00.167Z',
    runStartedAt: '2026-03-10T17:14:00.000Z',
    runFinishedAt: '2026-03-10T17:15:00.167Z',
    durationMs: 60167,
    targetDate: '05/22/2026',
    stayLength: '3',
    loop: 'BIRCH',
    targetTime: '07:59:59',
    monitorIntervalMins: null,
    launchMode: 'preload',
    checkoutAuthMode: 'manual',
    autoBook: true,
    dryRun: false,
    headed: true,
    profileMode: 'persistent',
    notificationProfile: 'test',
    accountsConfigured: ['lisarichards1984@gmail.com', 'jrichards1981@gmail.com'],
    accountsReady: ['lisarichards1984@gmail.com', 'jrichards1981@gmail.com'],
    accountsWithHolds: ['lisarichards1984@gmail.com'],
    agentCount: 6,
    bookingMode: 'multi',
    maxHolds: 3,
    siteListSource: undefined,
    requestedSites: ['BH03', 'BH09'],
    availableSites: ['BH03', 'BH09'],
    holds: [{
      account: 'lisarichards1984@gmail.com',
      agentId: 1,
      site: 'BH03',
      stage: 'order-details',
      timestamp: '2026-03-10T17:14:45.637Z',
      detailsUrl: 'https://example.com/BH03',
    }],
    winningAgent: 1,
    winningSite: 'BH03',
    status: 'success',
    sessionPreflight: [],
    cartPreflight: [],
    availabilityCheck: undefined,
    accounts: [{
      account: 'lisarichards1984@gmail.com',
      maxHolds: 3,
      holds: ['BH03'],
      holdDetails: [{
        account: 'lisarichards1984@gmail.com',
        agentId: 1,
        site: 'BH03',
        stage: 'order-details',
        timestamp: '2026-03-10T17:14:45.637Z',
        detailsUrl: 'https://example.com/BH03',
      }],
      assignedSites: ['BH03'],
      attemptedSites: ['BH03'],
      failedSites: [],
      verifiedCartSites: ['BH03'],
      verifiedCartCount: 1,
      stopReason: null,
      skippedSites: [],
    }],
    agents: [],
    ...overrides,
  };
}

describe('notify helpers', () => {
  test('missing recipient config disables iMessage fan-out cleanly', () => {
    expect(loadIMessageRecipients('test', '/tmp/does-not-exist.json')).toEqual([]);
  });

  test('loads multiple configured test recipients', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bear-lake-booker-'));
    const configPath = path.join(tempDir, 'notification-recipients.json');
    fs.writeFileSync(configPath, JSON.stringify({
      test: {
        imessageRecipients: ['+18015551212', ' +18015559876 ', '+18015551212'],
      },
      production: {
        imessageRecipients: ['+18015550000'],
      },
    }), 'utf-8');

    expect(loadIMessageRecipients('test', configPath)).toEqual(['+18015551212', '+18015559876']);
  });

  test('normalizes phone-number recipients while loading config', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bear-lake-booker-'));
    const configPath = path.join(tempDir, 'notification-recipients.json');
    fs.writeFileSync(configPath, JSON.stringify({
      test: {
        imessageRecipients: ['801-427-3898', '(801) 427-3898', '+1 801 427 3898'],
      },
    }), 'utf-8');

    expect(loadIMessageRecipients('test', configPath)).toEqual(['+18014273898']);
  });

  test('loads multiple configured production recipients', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bear-lake-booker-'));
    const configPath = path.join(tempDir, 'notification-recipients.json');
    fs.writeFileSync(configPath, JSON.stringify({
      test: {
        imessageRecipients: ['+18015551212'],
      },
      production: {
        imessageRecipients: ['+18015550000', ' +18015551111 ', '+18015550000'],
      },
    }), 'utf-8');

    expect(loadIMessageRecipients('production', configPath)).toEqual(['+18015550000', '+18015551111']);
  });

  test('missing selected profile returns no recipients', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bear-lake-booker-'));
    const configPath = path.join(tempDir, 'notification-recipients.json');
    fs.writeFileSync(configPath, JSON.stringify({
      test: {
        imessageRecipients: ['+18015551212'],
      },
    }), 'utf-8');

    expect(loadIMessageRecipients('production', configPath)).toEqual([]);
  });

  test('notification profiles default to test unless production is explicit', () => {
    expect(normalizeNotificationProfile(undefined)).toBe('test');
    expect(normalizeNotificationProfile('test')).toBe('test');
    expect(normalizeNotificationProfile('production')).toBe('production');
    expect(normalizeNotificationProfile('staging')).toBe('test');
  });

  test('normalizes iMessage recipients to E.164-style numbers when possible', () => {
    expect(normalizeIMessageRecipient('801-427-3898')).toBe('+18014273898');
    expect(normalizeIMessageRecipient('(801) 427-3898')).toBe('+18014273898');
    expect(normalizeIMessageRecipient('+1 801 427 3898')).toBe('+18014273898');
    expect(normalizeIMessageRecipient('jason@example.com')).toBe('jason@example.com');
  });

  test('builds AppleScript that targets the iMessage service explicitly', () => {
    expect(buildIMessageAppleScript('hello', '+18014273898')).toEqual([
      'tell application "Messages"',
      'set targetService to first service whose service type = iMessage',
      'set targetParticipant to participant "+18014273898" of targetService',
      'send "hello" to targetParticipant',
      'end tell',
    ]);
  });

  test('builds a final inventory summary grouped by account with details urls', () => {
    const summary = buildFinalInventorySummary(buildSummary());

    expect(summary).not.toBeNull();
    expect(summary?.message).toContain('Bear Lake Booker inventory for 05/22/2026');
    expect(summary?.message).toContain('lisarichards1984@gmail.com:');
    expect(summary?.message).toContain('- BH03: https://example.com/BH03');
  });

  test('does not build a final summary for zero-hold runs', () => {
    expect(buildFinalInventorySummary(buildSummary({
      holds: [],
      accountsWithHolds: [],
      accounts: [{
        account: 'lisarichards1984@gmail.com',
        maxHolds: 3,
        holds: [],
        holdDetails: [],
        assignedSites: [],
        attemptedSites: [],
        failedSites: [],
        verifiedCartSites: [],
        verifiedCartCount: 0,
        stopReason: null,
        skippedSites: [],
      }],
    }))).toBeNull();
  });

  test('does not build a final summary for dry-run site-details outcomes', () => {
    expect(buildFinalInventorySummary(buildSummary({
      dryRun: true,
      holds: [{
        account: 'lisarichards1984@gmail.com',
        agentId: 1,
        site: 'BH24',
        stage: 'site-details',
        timestamp: '2026-03-10T17:14:45.637Z',
        detailsUrl: 'https://example.com/BH24',
      }],
      accounts: [{
        account: 'lisarichards1984@gmail.com',
        maxHolds: 1,
        holds: ['BH24'],
        holdDetails: [{
          account: 'lisarichards1984@gmail.com',
          agentId: 1,
          site: 'BH24',
          stage: 'site-details',
          timestamp: '2026-03-10T17:14:45.637Z',
          detailsUrl: 'https://example.com/BH24',
        }],
        assignedSites: ['BH24'],
        attemptedSites: ['BH24'],
        failedSites: [],
        verifiedCartSites: [],
        verifiedCartCount: 0,
        stopReason: 'max-holds-reached',
        skippedSites: [],
      }],
    }))).toBeNull();
  });
});
