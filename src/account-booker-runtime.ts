import { type BrowserContext, type Page } from 'playwright';
import {
  addToCart,
  continueToOrderDetails,
  openSiteDetails,
  type AddToCartResult,
  type CheckoutAuthMode,
  type SiteSelection,
} from './automation';
import { type AccountBooker, type CaptureAccount } from './account-booker';
import { getSessionPath } from './session-utils';

export type BookerAttemptResult = 'success' | 'failed' | 'stopped';

type BookerAttemptOptions = {
  account: CaptureAccount;
  agentId: number;
  selection: SiteSelection;
  targetDate: string;
  stayLength: string;
  agentLabel: string;
  headed: boolean;
  checkoutAuthMode: CheckoutAuthMode;
  onCartFailure: () => Promise<void>;
  onCartVerified: (siteIds: string[]) => Promise<void>;
  onCartAttemptSettled: (result: AddToCartResult) => Promise<void>;
  onHoldSuccess: () => Promise<boolean>;
  onFailureArtifact: (path: string) => void;
  onSuccessArtifact: (path: string) => void;
};

export class AccountBookerRuntime {
  private page: Page | null = null;

  constructor(
    readonly booker: AccountBooker,
    readonly context: BrowserContext,
    private readonly account?: string,
  ) {}

  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page;
    }

    this.page = await this.context.newPage();
    return this.page;
  }

  async attemptBooking(options: BookerAttemptOptions): Promise<BookerAttemptResult> {
    return this.booker.bookingQueue.run(async () => {
      if (!this.booker.canAgentContinue(options.agentId)) {
        return 'stopped';
      }

      const page = await this.ensurePage();
      if (page.isClosed()) {
        return 'stopped';
      }

      const opened = await openSiteDetails(page, options.selection);
      if (!opened) {
        await options.onCartFailure();
        return 'failed';
      }

      const readyForCart = await continueToOrderDetails(page, options.targetDate, options.stayLength);
      if (!readyForCart) {
        await options.onCartFailure();
        return 'failed';
      }

      console.log(`${options.agentLabel}Reached Order Details for ${options.selection.site}. Finalizing hold...`);

      const cartResult = await addToCart(
        this.context,
        page,
        options.selection.site,
        options.agentLabel,
        options.account.account,
        options.headed,
        options.checkoutAuthMode,
      );
      await options.onCartAttemptSettled(cartResult);

      if (cartResult.success) {
        const registered = await options.onHoldSuccess();
        await options.onCartVerified(cartResult.cartSitesAfter);
        if (!registered) {
          return 'failed';
        }

        const screenshotPath = `logs/cart-agent-${options.agentId}-${options.selection.site}-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath }).catch(() => {});
        console.log(`${options.agentLabel}✅ Final hold secured in Shopping Cart! Screenshot: ${screenshotPath}`);
        options.onSuccessArtifact(screenshotPath);
        return 'success';
      }

      const errorPath = `logs/fail-cart-agent-${options.agentId}-${options.selection.site}-${Date.now()}.png`;
      await page.screenshot({ path: errorPath }).catch(() => {});
      console.log(`${options.agentLabel}Failed to move to Shopping Cart. Screenshot: ${errorPath}`);
      options.onFailureArtifact(errorPath);
      await options.onCartVerified(cartResult.cartSitesAfter);
      await options.onCartFailure();
      return 'failed';
    });
  }

  async saveSession(): Promise<void> {
    try {
      const sessionPath = getSessionPath(this.account);
      await this.context.storageState({ path: sessionPath });
      console.log(`[Session] Saved updated session state to ${sessionPath}`);
    } catch {
      // Context may already be closed; swallow the error.
    }
  }

  async close(): Promise<void> {
    await this.page?.close().catch(() => {});
    await this.context.close().catch(() => {});
  }
}
