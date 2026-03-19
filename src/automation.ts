import { type BrowserContext, type Page } from 'playwright';
import { PARK_URL } from './config';
import { getReserveAmericaCredentials } from './keychain';
import * as fs from 'fs';
import * as path from 'path';
import { getReadableSessionPath, injectSessionState } from './session-utils';
import { isAuthenticatedBodyText, looksLikeCheckoutLoginPage } from './checkout-auth';
import {
  determineCartConfirmation,
  extractCartSiteIds,
  type CartConfirmationSource,
  isCartUrl,
} from './cart-detection';

export type SiteSelection = {
  site: string;
  detailsUrl: string;
  actionText: string;
};

export type SearchResultRowDebug = {
  site: string;
  loop: string;
  actionText: string;
  leadingStatuses: string[];
};

type SearchResultsDebugArtifact = {
  pageUrl: string;
  selectedLoopValue: string;
  selectedLoopLabel: string;
  campingDate: string;
  lengthOfStay: string;
  rows: SearchResultRowDebug[];
};

export type CheckoutAuthMode = 'auto' | 'manual';

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 5000;
const ALLOWED_ROW_ACTIONS = ['SEE DETAILS', 'ENTER DATE', 'BOOK NOW', 'BOOK THESE DATES', 'AVAILABLE'];
const BOOKABLE_STATUS_CODES = new Set(['A', 'B']);
const CART_URL = 'https://utahstateparks.reserveamerica.com/viewShoppingCart.do';

export async function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function parseCalendarDate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const mmddyyyyMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (mmddyyyyMatch) {
    const [, month, day, year] = mmddyyyyMatch;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

export async function isErrorPage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = (document.body.textContent ?? '').toLowerCase();
    return text.includes('oops') || text.includes('experiencing some difficulties');
  });
}

export type LoginStatus = 'logged-in' | 'success' | 'failed' | 'captcha-required';

async function hasLoginForm(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return Boolean(
      document.querySelector('input[aria-label="Email"], #AEmailAddress, #email') &&
      document.querySelector('input[aria-label="Password"], #APassword, #password'),
    );
  });
}

async function isCheckoutLoginPage(page: Page): Promise<boolean> {
  const bodyText = (await page.textContent('body')) || '';
  const url = page.url();
  const title = await page.title().catch(() => '');
  return looksLikeCheckoutLoginPage({ bodyText, url, title });
}

function saveCheckoutDebugHtml(html: string) {
  const logDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const filename = `debug-checkout-fail-${Date.now()}.html`;
  fs.writeFileSync(path.join(logDir, filename), html, 'utf-8');
}

async function saveBookingDebugArtifacts(page: Page, prefix: string, agentLabel = ''): Promise<void> {
  const logDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const timestamp = Date.now();
  const screenshotPath = path.join(logDir, `${prefix}-${timestamp}.png`);

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => '');
  if (html) {
    fs.writeFileSync(path.join(logDir, `${prefix}-${timestamp}.html`), html, 'utf-8');
  }

  console.warn(`${agentLabel}Saved booking debug artifacts with prefix ${prefix}-${timestamp}.`);
}

export async function saveSearchResultsDebugArtifacts(page: Page, prefix: string, agentLabel = ''): Promise<void> {
  const logDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const timestamp = Date.now();
  const basePath = path.join(logDir, `${prefix}-${timestamp}`);

  await page.screenshot({ path: `${basePath}.png`, fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => '');
  if (html) {
    fs.writeFileSync(`${basePath}.html`, html, 'utf-8');
  }

  const artifact = await page.evaluate(() => {
    const loopSelect = document.querySelector<HTMLSelectElement>('#loop');
    const dateInput = document.querySelector<HTMLInputElement>('#campingDate');
    const stayInput = document.querySelector<HTMLInputElement>('#lengthOfStay');

    const rows = Array.from(document.querySelectorAll<HTMLDivElement>('.br'))
      .map((row) => {
        const siteLink = row.querySelector<HTMLAnchorElement>('.siteListLabel a');
        const loopName = row.querySelector<HTMLDivElement>('.td.loopName');
        const actionLink = row.querySelector<HTMLAnchorElement>('.td[class*="sitescompareselectorbtn"] a');
        const statusCells = Array.from(row.querySelectorAll<HTMLDivElement>('.td.status'));
        const site = siteLink?.textContent?.trim() ?? '';
        if (!site) {
          return null;
        }

        const leadingStatuses = statusCells.slice(0, 5).map((cell) => {
          const text = (cell.textContent ?? '').trim().toUpperCase();
          if (text) return text;

          const classNames = Array.from(cell.classList);
          const classCode = classNames.find((name) => /^[a-z]$/i.test(name));
          return classCode ? classCode.toUpperCase() : '';
        });

        return {
          site,
          loop: loopName?.textContent?.trim().toUpperCase() ?? '',
          actionText: actionLink?.textContent?.toUpperCase().trim() ?? '',
          leadingStatuses,
        } satisfies SearchResultRowDebug;
      })
      .filter((row): row is SearchResultRowDebug => Boolean(row));

    return {
      pageUrl: window.location.href,
      selectedLoopValue: loopSelect?.value ?? '',
      selectedLoopLabel: loopSelect?.selectedOptions?.[0]?.textContent?.trim().toUpperCase() ?? '',
      campingDate: dateInput?.value ?? '',
      lengthOfStay: stayInput?.value ?? '',
      rows,
    } satisfies SearchResultsDebugArtifact;
  }).catch(() => ({
    pageUrl: page.url(),
    selectedLoopValue: '',
    selectedLoopLabel: '',
    campingDate: '',
    lengthOfStay: '',
    rows: [],
  } satisfies SearchResultsDebugArtifact));

  fs.writeFileSync(`${basePath}.json`, JSON.stringify(artifact, null, 2), 'utf-8');
  console.warn(`${agentLabel}Saved search results debug artifacts with prefix ${prefix}-${timestamp}.`);
}

async function findVisibleActionSelector(page: Page, selectors: string[]): Promise<string | null> {
  for (const selector of selectors) {
    const btn = page.locator(selector).first();
    if ((await btn.count()) > 0 && (await btn.isVisible())) {
      return selector;
    }
  }

  return null;
}

async function waitForManualCheckoutAuth(page: Page, agentLabel = ''): Promise<boolean> {
  console.warn(`${agentLabel}Manual action required: complete checkout sign-in/CAPTCHA in the browser window.`);

  for (;;) {
    if (page.isClosed()) {
      return false;
    }

    const stillOnLogin = await isCheckoutLoginPage(page).catch(() => false);
    if (!stillOnLogin) {
      return true;
    }

    await sleep(1000);
  }
}

async function preFillLoginCredentials(page: Page, account: string | undefined, agentLabel = ''): Promise<boolean> {
  const credentials = getReserveAmericaCredentials(account);
  if (!credentials.password) {
    console.error(`${agentLabel}No password found in Keychain. Login will be manual/guest.`);
    return false;
  }

  await page.waitForSelector('input[aria-label="Email"], #AEmailAddress, #email', { timeout: 10000 });
  await page.fill('input[aria-label="Email"], #AEmailAddress, #email', credentials.username);
  await page.fill('input[aria-label="Password"], #APassword, #password', credentials.password);
  console.log(`${agentLabel}Pre-filled checkout sign-in for ${credentials.username}.`);
  return true;
}

export async function ensureLoggedIn(page: Page, agentLabel = '', account?: string): Promise<LoginStatus> {
  const bodyText = (await page.textContent('body')) || '';
  if (isAuthenticatedBodyText(bodyText)) return 'logged-in';

  console.log(`${agentLabel}Not logged in. Attempting automated login...`);

  try {
    if (!(await isCheckoutLoginPage(page))) {
      await page.goto('https://utahstateparks.reserveamerica.com/memberSignIn.do', { waitUntil: 'domcontentloaded' });
    }

    const prefilled = await preFillLoginCredentials(page, account, agentLabel);
    if (!prefilled) return 'failed';

    const hasCaptcha = await page.evaluate(() => {
      return Boolean(document.querySelector('iframe[src*="recaptcha"]')) || 
             Boolean(document.querySelector('.g-recaptcha')) ||
             Boolean(document.querySelector('#arkose')) ||
             (document.body.textContent ?? '').includes('Verify you are human');
    });

    if (hasCaptcha) {
      console.warn(`${agentLabel}⚠️ Captcha detected! Human intervention required.`);
      return 'captcha-required';
    }

    const btn = page.locator('button:has-text("Sign In"), input[type="submit"][value="Sign In"]').first();
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
      btn.click(),
    ]);

    const postLoginText = (await page.textContent('body')) || '';
    if (isAuthenticatedBodyText(postLoginText) || !(await hasLoginForm(page))) {
      console.log(`${agentLabel}✅ Login successful.`);
      return 'success';
    }
  } catch (e) {
    console.error(`${agentLabel}Login failed: ${e}`);
  }
  return 'failed';
}

export async function primeSearchForm(
  page: Page,
  loop: string,
  targetDate: string,
  stayLength: string,
  agentLabel = '',
): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    await page.goto(PARK_URL, { waitUntil: 'domcontentloaded' });
    if (await isErrorPage(page)) {
      await sleep(RETRY_BACKOFF_MS);
      continue;
    }
    try {
      await page.waitForSelector('#unifSearchForm', { timeout: 15000 });
      await page.waitForSelector('#loop', { timeout: 10000 });
      await page.waitForSelector('#campingDate', { timeout: 10000 });
      await page.waitForSelector('#lengthOfStay', { timeout: 10000 });
      break;
    } catch {
      if (attempt < MAX_RETRIES) {
        console.warn(`${agentLabel}Search form did not fully initialize on attempt ${attempt}. Retrying...`);
        await sleep(RETRY_BACKOFF_MS);
      } else {
        throw new Error('Search form did not fully initialize.');
      }
    }
  }

  const normalizedLoop = loop.trim().toUpperCase();
  const loopValue = await page.evaluate((desiredLoop) => {
    const select = document.querySelector<HTMLSelectElement>('#loop');
    if (!select) {
      return '';
    }

    const option = Array.from(select.options).find(
      (candidate) => candidate.textContent?.trim().toUpperCase() === desiredLoop,
    );
    return option?.value ?? '';
  }, normalizedLoop);
  if (!loopValue) {
    throw new Error(`Loop "${loop}" was not found in the browser search form.`);
  }

  await page.selectOption('#loop', loopValue);

  const dateInput = page.locator('#campingDate');
  await dateInput.fill(targetDate);

  const stayInput = page.locator('#lengthOfStay');
  await stayInput.fill(stayLength);

  const appliedState = await page.evaluate(() => {
    const loopSelect = document.querySelector<HTMLSelectElement>('#loop');
    const dateField = document.querySelector<HTMLInputElement>('#campingDate');
    const stayField = document.querySelector<HTMLInputElement>('#lengthOfStay');
    return {
      loopLabel: loopSelect?.selectedOptions?.[0]?.textContent?.trim().toUpperCase() ?? '',
      campingDate: dateField?.value ?? '',
      lengthOfStay: stayField?.value ?? '',
    };
  });

  const appliedDateKey = parseCalendarDate(appliedState.campingDate);
  const targetDateKey = parseCalendarDate(targetDate);
  if (
    appliedState.loopLabel !== normalizedLoop ||
    appliedState.lengthOfStay !== stayLength ||
    appliedDateKey === null ||
    targetDateKey === null ||
    appliedDateKey !== targetDateKey
  ) {
    throw new Error(
      `Search form did not retain requested values. loop=${appliedState.loopLabel || '<empty>'} date=${appliedState.campingDate || '<empty>'} length=${appliedState.lengthOfStay || '<empty>'}`,
    );
  }
}

export async function submitSearchForm(page: Page) {
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
  await page.locator('#unifSearchForm').evaluate((form) => {
    if (typeof (form as HTMLFormElement).requestSubmit === 'function') {
      (form as HTMLFormElement).requestSubmit();
      return;
    }
    (form as HTMLFormElement).submit();
  });
  await navigation;
}

export async function waitForSearchResults(page: Page) {
  await page.waitForFunction(
    () => {
      const body = document.body.textContent ?? '';
      return (
        Boolean(document.querySelector('#calendar .br')) ||
        body.includes('0 site(s) available') ||
        body.includes('beyond Reservation Window')
      );
    },
    { timeout: 15000 },
  );
}

export async function resolveTargetSites(
  page: Page,
  targetDate: string,
  stayLength: string,
  desiredLoop: string,
): Promise<SiteSelection[]> {
  return page.evaluate(
    ({ date, length, desiredLoopName, allowedActions, bookableStatusCodes }) => {
      const requestedNights = Number.parseInt(length, 10);
      const normalizedLoopName = desiredLoopName.trim().toUpperCase();
      const rows = Array.from(document.querySelectorAll<HTMLDivElement>('.br'));
      const mergedBySite = new Map<string, {
        site: string;
        detailsUrl: string;
        actionText: string;
        loopName: string;
        leadingStatuses: string[];
      }>();

      for (const row of rows) {
          const siteLink = row.querySelector<HTMLAnchorElement>('.siteListLabel a');
          const loopName = row.querySelector<HTMLDivElement>('.td.loopName')?.textContent?.trim().toUpperCase() ?? '';
          const actionLink = row.querySelector<HTMLAnchorElement>('.td[class*="sitescompareselectorbtn"] a');
          const actionText = actionLink?.textContent?.toUpperCase().trim() ?? '';
          const statusCells = Array.from(row.querySelectorAll<HTMLDivElement>('.td.status'));
          const site = siteLink?.textContent?.trim() ?? '';

          if (!siteLink || !site) continue;
          if (!Number.isFinite(requestedNights) || requestedNights < 1) continue;

          const leadingStatuses = statusCells
            .slice(0, requestedNights)
            .map((cell) => {
              const text = (cell.textContent ?? '').trim().toUpperCase();
              if (text) return text;

              const classNames = Array.from(cell.classList);
              const classCode = classNames.find((name) => /^[a-z]$/i.test(name));
              return classCode ? classCode.toUpperCase() : '';
            });

          const url = new URL(siteLink.href, window.location.href);
          url.searchParams.set('arvdate', date);
          url.searchParams.set('lengthOfStay', length);
          const existing = mergedBySite.get(site) ?? {
            site,
            detailsUrl: '',
            actionText: '',
            loopName: '',
            leadingStatuses: [],
          };

          if (!existing.detailsUrl) {
            existing.detailsUrl = url.toString();
          }
          if (!existing.actionText && actionText) {
            existing.actionText = actionText;
          }
          if (!existing.loopName && loopName) {
            existing.loopName = loopName;
          }
          if (leadingStatuses.length > existing.leadingStatuses.length) {
            existing.leadingStatuses = leadingStatuses;
          }

          mergedBySite.set(site, existing);
      }

      return Array.from(mergedBySite.values())
        .filter((candidate) => candidate.loopName === normalizedLoopName)
        .filter((candidate) => allowedActions.some((action) => candidate.actionText.includes(action)))
        .filter((candidate) => candidate.leadingStatuses.length >= requestedNights)
        .filter((candidate) => candidate.leadingStatuses.every((status) => bookableStatusCodes.includes(status)))
        .map(({ site, detailsUrl, actionText }) => ({ site, detailsUrl, actionText }));
    },
    {
      date: targetDate,
      length: stayLength,
      desiredLoopName: desiredLoop,
      allowedActions: ALLOWED_ROW_ACTIONS,
      bookableStatusCodes: Array.from(BOOKABLE_STATUS_CODES),
    },
  );
}

export async function openSiteDetails(page: Page, selection: SiteSelection): Promise<boolean> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    await page.goto(selection.detailsUrl, { waitUntil: 'domcontentloaded' });
    try {
      await page.waitForFunction(
        () => Boolean(document.querySelector('#booksiteform')) || Boolean(document.querySelector('#arrivaldate')),
        { timeout: 10000 },
      );
      return true;
    } catch {
      await sleep(2000);
    }
  }
  return false;
}

export async function prepareOrderDetails(page: Page, agentLabel = ''): Promise<void> {
  console.log(`${agentLabel}Interacting with Order Details form...`);

  // 1. Occupants (Click, Type, and Trigger Change)
  const occupantsInput = page.locator('#numoccupants, input[name="numOccupants"], #occupantCount').first();
  if ((await occupantsInput.count()) > 0) {
    await occupantsInput.click({ force: true }).catch(() => {});
    await occupantsInput.fill('1').catch(() => {});
    await occupantsInput.dispatchEvent('change').catch(() => {});
    await occupantsInput.dispatchEvent('blur').catch(() => {});
  }

  // 2. Vehicles
  const numVehicles = page.locator('#numvehicles, input[name="numVehicles"]').first();
  if ((await numVehicles.count()) > 0) {
    await numVehicles.click({ force: true }).catch(() => {});
    await numVehicles.fill('1').catch(() => {});
    await numVehicles.dispatchEvent('change').catch(() => {});
    await numVehicles.dispatchEvent('blur').catch(() => {});
  }

  // 3. Mandatory Checkboxes (Policies, etc.)
  const checkboxes = await page.locator('input[type="checkbox"]').all();
  for (const cb of checkboxes) {
    const isVisible = await cb.isVisible();
    if (isVisible) {
      console.log(`${agentLabel}Clicking mandatory checkbox...`);
      await cb.click({ force: true }).catch(() => {});
      const id = await cb.getAttribute('id');
      if (id) await page.click(`label[for="${id}"]`, { force: true }).catch(() => {});
    }
  }

}

export type CartState = {
  siteIds: string[];
  url: string;
  bodyText: string;
  checkoutLoginDetected: boolean;
  error: string | undefined;
};

export type AddToCartResult = {
  success: boolean;
  confirmationSource: CartConfirmationSource;
  finalUrl: string;
  cartSitesBefore: string[];
  cartSitesAfter: string[];
  clickedSelectors: string[];
  checkoutAuthEncountered: boolean;
  verificationError: string | undefined;
};

async function readCartStateFromPage(
  page: Page,
  agentLabel = '',
  account?: string,
  headed = false,
  checkoutAuthMode: CheckoutAuthMode = 'auto',
): Promise<CartState> {
  try {
    await page.goto(CART_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});

    if (await isCheckoutLoginPage(page)) {
      console.log(`${agentLabel}Cart verification requires checkout auth recovery...`);
      const loginResult = await ensureLoggedIn(page, agentLabel, account);
      if (loginResult === 'captcha-required') {
        if (checkoutAuthMode !== 'manual' || !headed) {
          return {
            siteIds: [],
            url: page.url(),
            bodyText: (await page.textContent('body')) || '',
            checkoutLoginDetected: true,
            error: 'checkout-auth-required',
          };
        }

        const recovered = await waitForManualCheckoutAuth(page, agentLabel);
        if (!recovered) {
          return {
            siteIds: [],
            url: page.url(),
            bodyText: (await page.textContent('body')) || '',
            checkoutLoginDetected: true,
            error: 'manual-checkout-auth-timeout',
          };
        }
      } else if (loginResult === 'failed') {
        return {
          siteIds: [],
          url: page.url(),
          bodyText: (await page.textContent('body')) || '',
          checkoutLoginDetected: true,
          error: 'checkout-auth-failed',
        };
      }
    }

    await page.goto(CART_URL, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    const cartSnapshot = await page.evaluate(() => {
      const bodyText = document.body?.textContent ?? '';
      const shoppingListText = document.querySelector('#shoppinglist')?.textContent ?? '';
      const cartCountText = document.querySelector('#shoppingcartnumdivid')?.textContent?.trim() ?? '';
      const emptyCartMessage = document.querySelector('.emptyCartMsgClass')?.textContent ?? '';
      return {
        bodyText,
        shoppingListText,
        cartCountText,
        emptyCartMessage,
      };
    }).catch(() => ({
      bodyText: '',
      shoppingListText: '',
      cartCountText: '',
      emptyCartMessage: '',
    }));
    const bodyText = cartSnapshot.bodyText;
    const emptyCart =
      cartSnapshot.emptyCartMessage.toLowerCase().includes('shopping cart is empty')
      || cartSnapshot.cartCountText === '0';
    const cartText = cartSnapshot.shoppingListText || bodyText;
    return {
      siteIds: emptyCart ? [] : extractCartSiteIds(cartText),
      url: page.url(),
      bodyText,
      checkoutLoginDetected: await isCheckoutLoginPage(page).catch(() => false),
      error: undefined,
    };
  } catch (error) {
    return {
      siteIds: [],
      url: page.url(),
      bodyText: '',
      checkoutLoginDetected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function inspectCartState(
  context: BrowserContext,
  agentLabel = '',
  account?: string,
  headed = false,
  checkoutAuthMode: CheckoutAuthMode = 'auto',
): Promise<CartState> {
  const page = await context.newPage();
  try {
    return await readCartStateFromPage(page, agentLabel, account, headed, checkoutAuthMode);
  } finally {
    await page.close().catch(() => {});
  }
}

export async function addToCart(
  context: BrowserContext,
  page: Page,
  requestedSite: string,
  agentLabel = '',
  account?: string,
  headed = false,
  checkoutAuthMode: CheckoutAuthMode = 'auto',
  skipCartInspection = false,
): Promise<AddToCartResult> {
  const cartBefore = skipCartInspection
    ? { siteIds: [], url: '', bodyText: '', checkoutLoginDetected: false, error: undefined }
    : await inspectCartState(
        context,
        `${agentLabel}[Cart Before] `,
        account,
        headed,
        checkoutAuthMode,
      );
  const emptyCartState: CartState = { siteIds: [], url: '', bodyText: '', checkoutLoginDetected: false, error: undefined };
  const inspectCartAfter = skipCartInspection
    ? async () => emptyCartState
    : (label: string) => inspectCartState(context, label, account, headed, checkoutAuthMode);
  const clickedSelectors: string[] = [];
  let checkoutAuthEncountered = false;

  for (let attempt = 1; attempt <= 2; attempt++) {
    if (await isCheckoutLoginPage(page)) {
      checkoutAuthEncountered = true;
      console.log(`${agentLabel}Checkout auth required. Attempting session recovery...`);
      const loginResult = await ensureLoggedIn(page, agentLabel, account);
      if (loginResult === 'captcha-required') {
        if (checkoutAuthMode !== 'manual') {
          console.error(`${agentLabel}Checkout CAPTCHA encountered in auto mode. Re-run with --headed --checkoutAuthMode manual.`);
          const cartAfter = await inspectCartAfter(`${agentLabel}[Cart After] `);
          return {
            success: false,
            confirmationSource: 'checkout-login',
            finalUrl: page.url(),
            cartSitesBefore: cartBefore.siteIds,
            cartSitesAfter: cartAfter.siteIds,
            clickedSelectors,
            checkoutAuthEncountered,
            verificationError: cartAfter.error ?? cartBefore.error,
          };
        }

        if (!headed) {
          console.error(`${agentLabel}Checkout CAPTCHA cannot be solved in headless mode. Re-run with --headed --checkoutAuthMode manual.`);
          const cartAfter = await inspectCartAfter(`${agentLabel}[Cart After] `);
          return {
            success: false,
            confirmationSource: 'checkout-login',
            finalUrl: page.url(),
            cartSitesBefore: cartBefore.siteIds,
            cartSitesAfter: cartAfter.siteIds,
            clickedSelectors,
            checkoutAuthEncountered,
            verificationError: cartAfter.error ?? cartBefore.error,
          };
        }

        const recovered = await waitForManualCheckoutAuth(page, agentLabel);
        if (!recovered) {
          console.error(`${agentLabel}Timed out waiting for manual checkout sign-in/CAPTCHA.`);
          const cartAfter = await inspectCartAfter(`${agentLabel}[Cart After] `);
          return {
            success: false,
            confirmationSource: 'checkout-login',
            finalUrl: page.url(),
            cartSitesBefore: cartBefore.siteIds,
            cartSitesAfter: cartAfter.siteIds,
            clickedSelectors,
            checkoutAuthEncountered,
            verificationError: cartAfter.error ?? cartBefore.error,
          };
        }
      } else if (loginResult === 'failed') {
        const cartAfter = await inspectCartAfter(`${agentLabel}[Cart After] `);
        return {
          success: false,
          confirmationSource: 'checkout-login',
          finalUrl: page.url(),
          cartSitesBefore: cartBefore.siteIds,
          cartSitesAfter: cartAfter.siteIds,
          clickedSelectors,
          checkoutAuthEncountered,
          verificationError: cartAfter.error ?? cartBefore.error,
        };
      }
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }

    await prepareOrderDetails(page, agentLabel);

    const selectors = [
      '#btnbooknow',
      '#btnbookdates',
      'button:has-text("Proceed to Cart")',
      'button:has-text("Book these Dates")',
      'button:has-text("Book Now")',
      '.btn[name="submitSiteForm"]',
      'input[type="submit"][value="Proceed to Cart"]',
    ];

    console.log(`${agentLabel}Searching for cart confirmation button...`);

    for (const selector of selectors) {
      const btn = page.locator(selector).first();
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        clickedSelectors.push(selector);
        console.log(`${agentLabel}Found button with selector: ${selector}. Clicking...`);
        const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
        await btn.click({ force: true });
        await nav;

        const currentUrl = page.url();
        if (isCartUrl(currentUrl)) {
          const cartAfter = await inspectCartAfter(`${agentLabel}[Cart After] `);
          return {
            success: true,
            confirmationSource: 'cart-url',
            finalUrl: currentUrl,
            cartSitesBefore: cartBefore.siteIds,
            cartSitesAfter: cartAfter.siteIds,
            clickedSelectors,
            checkoutAuthEncountered,
            verificationError: cartAfter.error ?? cartBefore.error,
          };
        }

        if (await isCheckoutLoginPage(page)) {
          checkoutAuthEncountered = true;
          console.log(`${agentLabel}Checkout redirected to sign-in. Retrying after login recovery...`);
          break;
        }

        console.log(`${agentLabel}Clicked, but URL is ${currentUrl}. Looking for more buttons...`);
      }
    }

    const primaryBtn = page.locator('button.primary, .btn-primary, .btn-success').first();
    if ((await primaryBtn.count()) > 0) {
      console.log(`${agentLabel}Trying fallback primary button...`);
      clickedSelectors.push('button.primary, .btn-primary, .btn-success');
      await primaryBtn.click().catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      if (isCartUrl(page.url())) {
        const cartAfter = await inspectCartAfter(`${agentLabel}[Cart After] `);
        return {
          success: true,
          confirmationSource: 'cart-url',
          finalUrl: page.url(),
          cartSitesBefore: cartBefore.siteIds,
          cartSitesAfter: cartAfter.siteIds,
          clickedSelectors,
          checkoutAuthEncountered,
          verificationError: cartAfter.error ?? cartBefore.error,
        };
      }
    }
  }

  const finalUrl = page.url();
  const html = await page.content().catch(() => '');
  const bodyText = (await page.textContent('body')) || '';
  const checkoutLoginDetected = await isCheckoutLoginPage(page).catch(() => false);
  const cartAfter = await inspectCartAfter(`${agentLabel}[Cart After] `);
  const confirmation = determineCartConfirmation({
    finalUrl,
    bodyText,
    requestedSite,
    cartSitesBefore: cartBefore.siteIds,
    cartSitesAfter: cartAfter.siteIds,
    checkoutLoginDetected: checkoutLoginDetected || cartAfter.checkoutLoginDetected,
  });

  if (!confirmation.success && html) {
    saveCheckoutDebugHtml(html);
  }

  return {
    success: confirmation.success,
    confirmationSource: confirmation.source,
    finalUrl,
    cartSitesBefore: cartBefore.siteIds,
    cartSitesAfter: cartAfter.siteIds,
    clickedSelectors,
    checkoutAuthEncountered,
    verificationError: cartAfter.error ?? cartBefore.error,
  };
}

export async function verifyCartSiteIds(
  page: Page,
  agentLabel = '',
  account?: string,
  headed = false,
  checkoutAuthMode: CheckoutAuthMode = 'auto',
): Promise<string[]> {
  const state = await readCartStateFromPage(page, agentLabel, account, headed, checkoutAuthMode);
  return state.siteIds;
}

export async function continueToOrderDetails(
  page: Page,
  targetDate: string,
  stayLength: string,
): Promise<boolean> {
  const ready = await prepareSiteForBooking(page, targetDate, stayLength);
  if (!ready) return false;

  if (page.url().includes('/switchBookingAction.do')) {
    return true;
  }

  const selectors = [
    '#btnbookdates',
    '#btnbooknow',
    'button:has-text("Book Now")',
    'button:has-text("Book these Dates")',
    'button:has-text("Proceed to Cart")',
    '.btn[name="submitSiteForm"]',
    'input[type="submit"][value="Book Now"]',
    'input[type="submit"][value="Book these Dates"]',
    'input[type="submit"][value="Proceed to Cart"]',
  ];
  const selector = await findVisibleActionSelector(page, selectors);
  if (!selector) {
    await saveBookingDebugArtifacts(page, 'debug-order-details-button-missing');
    return false;
  }

  const btn = page.locator(selector).first();
  const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
  await btn.click({ force: true }).catch(async () => {
    await saveBookingDebugArtifacts(page, 'debug-order-details-click-failed');
    throw new Error(`Unable to click order-details transition button: ${selector}`);
  });
  await nav;

  return page
    .waitForFunction(
      () => window.location.pathname.includes('/switchBookingAction.do') || (document.body.textContent ?? '').includes('Order Details'),
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(async () => {
      await saveBookingDebugArtifacts(page, 'debug-order-details-timeout');
      return false;
    });
}

export async function prepareSiteForBooking(
  page: Page,
  targetDate: string,
  stayLength: string,
): Promise<boolean> {
  const isReady = await page.evaluate(() => {
    const form = document.querySelector('#booksiteform');
    const action = form?.getAttribute('action') ?? '';
    return (
      action.includes('/switchBookingAction.do') &&
      (document.querySelector('#dateChosen') as HTMLInputElement)?.value === 'true'
    );
  });
  if (isReady) return true;

  await page.locator('#arrivaldate').fill(targetDate);
  await page.locator('#lengthOfStay').fill(stayLength);
  const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
  await page.locator('#btnbookdates').first().click();
  await nav;

  return page.evaluate(() => (document.querySelector('#dateChosen') as HTMLInputElement)?.value === 'true');
}

export async function injectSession(context: BrowserContext, account?: string) {
  const sessionPath = getReadableSessionPath(account);
  if (!fs.existsSync(sessionPath)) return;
  await injectSessionState(context, sessionPath);
}
