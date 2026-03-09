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
};

export class AccountBooker {
  readonly holds: HoldRecord[] = [];

  readonly bookingQueue = new SerialTaskQueue();

  readonly bookingSitesInFlight = new Set<string>();

  readonly failedBookingSites = new Set<string>();

  isClosed = false;

  winningAgentId: number | null = null;

  consecutiveCartFailures = 0;

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
    return this.holds.some((hold) => hold.site === siteId);
  }

  hasFailedSite(siteId: string): boolean {
    return this.failedBookingSites.has(siteId);
  }

  reserveSite(siteId: string): boolean {
    if (this.isClosed || this.bookingSitesInFlight.has(siteId)) {
      return false;
    }

    this.bookingSitesInFlight.add(siteId);
    return true;
  }

  releaseSite(siteId: string): void {
    this.bookingSitesInFlight.delete(siteId);
  }

  get pendingAttemptCount(): number {
    return this.bookingQueue.pendingCount;
  }

  recordSuccess(agentId: number, siteId: string, stage: SuccessStage): { registered: boolean; shouldClose: boolean } {
    if (this.isClosed || this.hasHold(siteId)) {
      return { registered: false, shouldClose: false };
    }

    this.holds.push({
      account: this.account.displayName,
      agentId,
      site: siteId,
      stage,
      timestamp: new Date().toISOString(),
    });

    if (stage === 'order-details') {
      this.consecutiveCartFailures = 0;
    }

    const shouldClose = this.holds.length >= this.maxHolds;
    if (shouldClose) {
      this.isClosed = true;
      this.winningAgentId = agentId;
    }

    return { registered: true, shouldClose };
  }

  recordCartFailure(agentId: number, siteId: string): boolean {
    this.failedBookingSites.add(siteId);
    this.consecutiveCartFailures += 1;

    const shouldClose = shouldStopAccountAfterCartFailure(
      this.maxHolds,
      this.holds.length,
      this.consecutiveCartFailures,
    );
    if (shouldClose) {
      this.isClosed = true;
      this.winningAgentId = null;
    }

    return shouldClose;
  }
}
