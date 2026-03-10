import { type SuccessStage } from './notify';
import { shouldStopAccountAfterCartFailure } from './booking-policy';
import { SerialTaskQueue } from './serial-task-queue';

export type CaptureAccount = {
  account: string | undefined;
  displayName: string;
  storageKey: string;
};

export type HoldRecord = {
  account: string;
  agentId: number;
  site: string;
  stage: SuccessStage;
  timestamp: string;
  detailsUrl: string | undefined;
};

export type AccountStopReason =
  | 'max-holds-reached'
  | 'verified-cart-cap'
  | 'cart-failure-threshold'
  | 'candidate-exhausted';

export type AccountSkipReason =
  | 'already-held'
  | 'already-failed-for-account'
  | 'already-reserved-for-account'
  | 'account-at-cap';

export type AccountSkipEvent = {
  site: string;
  reason: AccountSkipReason;
  agentId: number | null;
  timestamp: string;
};

function normalizeSiteId(siteId: string): string {
  return siteId.trim().toUpperCase();
}

export class AccountBooker {
  readonly holds: HoldRecord[] = [];

  readonly bookingQueue = new SerialTaskQueue();

  readonly bookingSitesInFlight = new Set<string>();

  readonly failedBookingSites = new Set<string>();

  readonly assignedSites = new Set<string>();

  readonly attemptedSites = new Set<string>();

  readonly verifiedCartSites = new Set<string>();

  readonly skipEvents: AccountSkipEvent[] = [];

  isClosed = false;

  winningAgentId: number | null = null;

  consecutiveCartFailures = 0;

  stopReason: AccountStopReason | null = null;

  constructor(
    readonly account: CaptureAccount,
    readonly maxHolds: number,
  ) {}

  canAgentContinue(agentId: number): boolean {
    if (!this.isClosed) {
      return true;
    }

    return this.winningAgentId === agentId;
  }

  hasHold(siteId: string): boolean {
    const normalized = normalizeSiteId(siteId);
    return this.holds.some((hold) => normalizeSiteId(hold.site) === normalized);
  }

  hasFailedSite(siteId: string): boolean {
    return this.failedBookingSites.has(normalizeSiteId(siteId));
  }

  hasAssignedSite(siteId: string): boolean {
    return this.assignedSites.has(normalizeSiteId(siteId));
  }

  markAssignedSite(siteId: string): void {
    this.assignedSites.add(normalizeSiteId(siteId));
  }

  markAttemptedSite(siteId: string): void {
    this.attemptedSites.add(normalizeSiteId(siteId));
  }

  recordSkip(siteId: string, reason: AccountSkipReason, agentId: number | null): void {
    this.skipEvents.push({
      site: normalizeSiteId(siteId),
      reason,
      agentId,
      timestamp: new Date().toISOString(),
    });
  }

  getPendingAssignedSites(): string[] {
    return Array.from(this.assignedSites).filter(
      (siteId) => !this.hasHold(siteId) && !this.hasFailedSite(siteId),
    );
  }

  setStopReason(reason: AccountStopReason): void {
    if (!this.stopReason) {
      this.stopReason = reason;
    }
  }

  recordVerifiedCartSites(siteIds: string[]): { verifiedCount: number; shouldClose: boolean } {
    const normalized = Array.from(new Set(siteIds.map((siteId) => normalizeSiteId(siteId))));
    if (normalized.length > 0 || this.verifiedCartSites.size === 0) {
      this.verifiedCartSites.clear();
      for (const siteId of normalized) {
        this.verifiedCartSites.add(siteId);
      }
    }

    const shouldClose = this.verifiedCartSites.size >= this.maxHolds;
    if (shouldClose) {
      this.isClosed = true;
      this.setStopReason('verified-cart-cap');
    }

    return {
      verifiedCount: this.verifiedCartSites.size,
      shouldClose,
    };
  }

  reserveSite(siteId: string): boolean {
    const normalized = normalizeSiteId(siteId);
    if (this.isClosed || this.bookingSitesInFlight.has(normalized)) {
      return false;
    }

    this.bookingSitesInFlight.add(normalized);
    return true;
  }

  releaseSite(siteId: string): void {
    this.bookingSitesInFlight.delete(normalizeSiteId(siteId));
  }

  get pendingAttemptCount(): number {
    return this.bookingQueue.pendingCount;
  }

  recordSuccess(
    agentId: number,
    siteId: string,
    stage: SuccessStage,
    detailsUrl?: string,
  ): { registered: boolean; shouldClose: boolean } {
    if (this.isClosed || this.hasHold(siteId)) {
      return { registered: false, shouldClose: false };
    }

    this.holds.push({
      account: this.account.displayName,
      agentId,
      site: siteId,
      stage,
      timestamp: new Date().toISOString(),
      detailsUrl,
    });

    if (stage === 'order-details') {
      this.consecutiveCartFailures = 0;
    }

    const shouldClose = this.holds.length >= this.maxHolds;
    if (shouldClose) {
      this.isClosed = true;
      this.winningAgentId = agentId;
      this.setStopReason('max-holds-reached');
    }

    return { registered: true, shouldClose };
  }

  recordCartFailure(agentId: number, siteId: string): boolean {
    this.failedBookingSites.add(normalizeSiteId(siteId));
    this.consecutiveCartFailures += 1;

    const shouldClose = shouldStopAccountAfterCartFailure(
      this.maxHolds,
      this.holds.length,
      this.consecutiveCartFailures,
    );
    if (shouldClose) {
      this.isClosed = true;
      this.winningAgentId = null;
      this.setStopReason('cart-failure-threshold');
    }

    return shouldClose;
  }
}
