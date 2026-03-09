import { type BrowserContext, type Page } from 'playwright';
import { PARK_URL } from './config';
import { getReserveAmericaCredentials } from './keychain';
import * as fs from 'fs';
import * as path from 'path';
import { getReadableSessionPath, injectSessionState } from './session-utils';

export type SiteSelection = {
  site: string;
  detailsUrl: string;
  actionText: string;
};

const MAX_RETRIES = 3;
const RETRY_BACKOFF_MS = 5000;
const ALLOWED_ROW_ACTIONS = ['SEE DETAILS', 'ENTER DATE', 'BOOK NOW', 'BOOK THESE DATES', 'AVAILABLE'];

export async function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function isErrorPage(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = (document.body.textContent ?? '').toLowerCase();
    return text.includes('oops') || text.includes('experiencing some difficulties');
  });
}

export type LoginStatus = 'logged-in' | 'success' | 'failed' | 'captcha-required';

function isAuthenticatedBodyText(bodyText: string): boolean {
  return bodyText.includes('Sign Out') || bodyText.includes('Member Sign Out');
}

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
  if (bodyText.includes('Sign In to Continue with Checkout')) return true;

  const url = page.url();
  if (url.includes('memberSignInSignUp.do') || url.includes('memberSignIn.do')) return true;

  const title = await page.title().catch(() => '');
  return title.includes('Sign In');
}

function saveCheckoutDebugHtml(html: string) {
  const logDir = path.resolve(process.cwd(), 'logs');
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
  const filename = `debug-checkout-fail-${Date.now()}.html`;
  fs.writeFileSync(path.join(logDir, filename), html, 'utf-8');
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
      break;
    } catch {
      if (attempt < MAX_RETRIES) await sleep(RETRY_BACKOFF_MS);
      else throw new Error('Search form not found.');
    }
  }

  await page.evaluate(
    ({ loopName, date, length }) => {
      const loopSelect = document.querySelector<HTMLSelectElement>('#loop');
      const dateInput = document.querySelector<HTMLInputElement>('#campingDate');
      const stayInput = document.querySelector<HTMLInputElement>('#lengthOfStay');
      if (!loopSelect || !dateInput || !stayInput) throw new Error('Elements missing.');

      const option = Array.from(loopSelect.options).find(
        (o) => o.textContent?.trim().toUpperCase() === loopName.toUpperCase(),
      );
      if (!option) throw new Error('Loop missing.');
      loopSelect.value = option.value;
      loopSelect.dispatchEvent(new Event('change', { bubbles: true }));
      dateInput.value = date;
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
      stayInput.value = length;
      stayInput.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { loopName: loop, date: targetDate, length: stayLength },
  );
}

export async function submitSearchForm(page: Page) {
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
  await page.evaluate(() =>
    (window as any).UnifSearchEngine
      ? (window as any).UnifSearchEngine.submitForm()
      : document.querySelector<HTMLFormElement>('#unifSearchForm')?.submit(),
  );
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
): Promise<SiteSelection[]> {
  return page.evaluate(
    ({ date, length, allowedActions }) => {
      const rows = Array.from(document.querySelectorAll<HTMLDivElement>('.br'));
      return rows
        .map((row) => {
          const siteLink = row.querySelector<HTMLAnchorElement>('.siteListLabel a');
          const actionLink = row.querySelector<HTMLAnchorElement>('.td[class*="sitescompareselectorbtn"] a');
          const actionText = actionLink?.textContent?.toUpperCase().trim() ?? '';

          if (!siteLink || !actionLink) return null;
          if (!allowedActions.some((a) => actionText.includes(a))) return null;

          const url = new URL(siteLink.href, window.location.href);
          url.searchParams.set('arvdate', date);
          url.searchParams.set('lengthOfStay', length);
          return { site: siteLink.textContent?.trim() ?? '', detailsUrl: url.toString(), actionText };
        })
        .filter((s): s is SiteSelection => Boolean(s?.site));
    },
    { date: targetDate, length: stayLength, allowedActions: ALLOWED_ROW_ACTIONS },
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

  await sleep(500);
}

export async function addToCart(page: Page, agentLabel = '', account?: string, headed = false): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (await isCheckoutLoginPage(page)) {
      console.log(`${agentLabel}Checkout requires login. Attempting session recovery...`);
      const loginResult = await ensureLoggedIn(page, agentLabel, account);
      if (loginResult === 'captcha-required') {
        if (!headed) {
          console.error(`${agentLabel}Checkout CAPTCHA cannot be solved in headless mode. Re-run with --headed.`);
          break;
        }

        const recovered = await waitForManualCheckoutAuth(page, agentLabel);
        if (!recovered) {
          console.error(`${agentLabel}Timed out waiting for manual checkout sign-in/CAPTCHA.`);
          break;
        }
      } else if (loginResult === 'failed') {
        break;
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
        console.log(`${agentLabel}Found button with selector: ${selector}. Clicking...`);
        const nav = page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null);
        await btn.click({ force: true });
        await nav;

        const currentUrl = page.url();
        if (currentUrl.includes('viewShoppingCart.do') || currentUrl.includes('shoppingCart.do')) {
          return true;
        }

        if (await isCheckoutLoginPage(page)) {
          console.log(`${agentLabel}Checkout redirected to sign-in. Retrying after login recovery...`);
          break;
        }

        console.log(`${agentLabel}Clicked, but URL is ${currentUrl}. Looking for more buttons...`);
      }
    }

    const primaryBtn = page.locator('button.primary, .btn-primary, .btn-success').first();
    if ((await primaryBtn.count()) > 0) {
      console.log(`${agentLabel}Trying fallback primary button...`);
      await primaryBtn.click().catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      if (page.url().includes('viewShoppingCart.do') || page.url().includes('shoppingCart.do')) {
        return true;
      }
    }
  }

  const html = await page.content().catch(() => '');
  if (html) saveCheckoutDebugHtml(html);

  return page.evaluate(() => {
    const bodyText = document.body.textContent ?? '';
    return (
      window.location.pathname.includes('/viewShoppingCart.do') ||
      window.location.pathname.includes('/shoppingCart.do') ||
      bodyText.includes('Shopping Cart')
    );
  });
}

export async function continueToOrderDetails(
  page: Page,
  targetDate: string,
  stayLength: string,
): Promise<boolean> {
  const ready = await prepareSiteForBooking(page, targetDate, stayLength);
  if (!ready) return false;

  const btn = page.locator('#btnbookdates, #btnbooknow, button:has-text("Book Now")').first();
  const nav = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null);
  await btn.click();
  await nav;

  return page
    .waitForFunction(
      () => window.location.pathname.includes('/switchBookingAction.do') || (document.body.textContent ?? '').includes('Order Details'),
      { timeout: 15000 },
    )
    .then(() => true)
    .catch(() => false);
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
