import * as fs from 'fs';
import * as path from 'path';

export interface HoldRecord {
  account: string;
  agentId: number;
  site: string;
  stage: string;
  timestamp: string;
  detailsUrl: string | undefined;
}

export interface AgentLaunchTelemetry {
  mode: string;
  startedAt: string;
  warmupStartedAt: string;
  warmupCompletedAt: string | undefined;
  waitStartedAt: string | undefined;
  targetTimeReachedAt: string | undefined;
  refreshStartedAt: string | undefined;
  freshPageOpenedAt: string | undefined;
  submitStartedAt: string;
  resultsVisibleAt: string;
  durationsMs: {
    warmup: number | undefined;
    waitForTarget: number | undefined;
    submitToResults: number;
    totalLaunch: number;
  };
}

export interface AgentRunSummary {
  account: string;
  agentId: number;
  preferredSite: string | null;
  outcome:
    | 'order-details-held'
    | 'site-details-held'
    | 'cart-failed'
    | 'no-candidates'
    | 'stopped'
    | 'exhausted'
    | 'error'
    | 'running';
  startedAt: string;
  finishedAt: string | undefined;
  durationMs: number | undefined;
  launch: AgentLaunchTelemetry | null;
  candidateSites: string[];
  attemptedSites: string[];
  cartSitesBefore: string[] | undefined;
  cartSitesAfter: string[] | undefined;
  cartConfirmationSource: string | null;
  finalAttemptUrl: string | undefined;
  clickedCartSelectors: string[] | undefined;
  checkoutAuthEncountered: boolean | undefined;
  cartVerificationError: string | undefined;
  skippedSites: Array<{
    site: string;
    reason: string;
  }>;
  heldSite: string | null;
  error: string | undefined;
  artifacts: {
    successScreenshotPath: string | undefined;
    failureScreenshotPaths: string[];
  };
}

export interface AccountRunSummary {
  account: string;
  maxHolds: number;
  holds: string[];
  holdDetails: HoldRecord[];
  assignedSites: string[];
  attemptedSites: string[];
  failedSites: string[];
  verifiedCartSites: string[];
  verifiedCartCount: number;
  stopReason: string | null;
  skippedSites: Array<{
    site: string;
    reason: string;
    agentId: number | null;
    timestamp: string;
  }>;
}

export interface RunSummary {
  timestamp: string;
  runStartedAt: string;
  runFinishedAt: string;
  durationMs: number;
  targetDate: string;
  stayLength: string;
  loop: string;
  targetTime: string | undefined;
  monitorIntervalMins: number | null;
  launchMode: string;
  checkoutAuthMode: 'auto' | 'manual';
  autoBook: boolean;
  dryRun: boolean;
  headed: boolean;
  profileMode: string;
  notificationProfile: 'test' | 'production';
  accountsConfigured: string[];
  accountsReady: string[];
  accountsWithHolds: string[];
  agentCount: number;
  bookingMode: 'single' | 'multi';
  maxHolds: number;
  siteListSource: string | undefined;
  requestedSites: string[];
  availableSites: string[];
  holds: HoldRecord[];
  winningAgent: number | null;
  winningSite: string | null;
  status: 'success' | 'failure' | 'no-availability' | 'auth-failed' | 'error';
  sessionPreflight: Array<{
    account: string;
    result: string;
    checkedAt: string;
  }>;
  cartPreflight?: Array<{
    account: string;
    result: string;
    siteIds: string[];
    checkedAt: string;
    error: string | undefined;
  }>;
  availabilityCheck: {
    startedAt: string;
    finishedAt: string;
    matchedSites: string[];
    allowlistApplied: boolean;
  } | undefined;
  accounts: AccountRunSummary[];
  agents: AgentRunSummary[];
}

export function writeRunSummary(summary: RunSummary) {
  const logsDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `summary-${timestampStr}.json`;
  const filepath = path.join(logsDir, filename);

  try {
    fs.writeFileSync(filepath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`\nRun summary written to ${filepath}`);
  } catch (error) {
    console.error(`Failed to write run summary: ${error}`);
  }
}
