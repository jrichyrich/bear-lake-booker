import { type Page } from 'playwright';
import { PARK_URL, SITE_DETAILS_URL_BASE } from './config';
import { isSessionValid } from './session-utils';

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

export async function ensureLoggedIn(page: Page, agentLabel = ''): Promise<boolean> {
  if (await isSessionValid(page)) {
    console.log(`${agentLabel}✅ Session is valid and logged in.`);
    return true;
  }

  console.error(`${agentLabel}❌ CRITICAL ERROR: Session is expired or invalid.`);
  return false;
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
    await occupantsInput.click({ force: true }).catch(() => { });
    await occupantsInput.fill('1').catch(() => { });
    await occupantsInput.dispatchEvent('change').catch(() => { });
    await occupantsInput.dispatchEvent('blur').catch(() => { });
  }

  // 2. Vehicles
  const numVehicles = page.locator('#numvehicles, input[name="numVehicles"]').first();
  if ((await numVehicles.count()) > 0) {
    await numVehicles.click({ force: true }).catch(() => { });
    await numVehicles.fill('1').catch(() => { });
    await numVehicles.dispatchEvent('change').catch(() => { });
    await numVehicles.dispatchEvent('blur').catch(() => { });
  }

  // 3. Mandatory Checkboxes (Policies, etc.)
  const checkboxes = await page.locator('input[type="checkbox"]').all();
  for (const cb of checkboxes) {
    const isVisible = await cb.isVisible();
    if (isVisible) {
      console.log(`${agentLabel}Clicking mandatory checkbox...`);
      await cb.click({ force: true }).catch(() => { });
      const id = await cb.getAttribute('id');
      if (id) await page.click(`label[for="${id}"]`, { force: true }).catch(() => { });
    }
  }

  await sleep(500);
}

export async function addToCart(page: Page, agentLabel = ''): Promise<boolean> {
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
      console.log(`${agentLabel}Clicked, but URL is ${currentUrl}. Looking for more buttons...`);
    }
  }

  const primaryBtn = page.locator('button.primary, .btn-primary, .btn-success').first();
  if ((await primaryBtn.count()) > 0) {
    console.log(`${agentLabel}Trying fallback primary button...`);
    await primaryBtn.click().catch(() => { });
    await page.waitForLoadState('networkidle').catch(() => { });
  }

  return page.evaluate(
    () =>
      window.location.pathname.includes('/viewShoppingCart.do') ||
      window.location.pathname.includes('/shoppingCart.do') ||
      (document.body.textContent ?? '').includes('Shopping Cart'),
  );
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

/**
 * Constructs a direct URL to a specific site's details/booking page,
 * bypassing the search flow entirely.
 */
export function buildDirectSiteUrl(siteId: string, targetDate: string, stayLength: string): string {
  const params = new URLSearchParams({
    contractCode: 'UT',
    parkId: '343061',
    siteId,
    arvdate: targetDate,
    lengthOfStay: stayLength,
  });
  return `${SITE_DETAILS_URL_BASE}?${params.toString()}`;
}

/**
 * Generic polling utility for async conditions.
 */
async function pollUntil<T>(
  action: () => Promise<T>,
  condition: (result: T) => boolean | Promise<boolean>,
  options: { maxDurationMs: number; intervalMs: number; label?: string }
): Promise<T | null> {
  const deadline = performance.now() + options.maxDurationMs;
  let attempt = 0;

  while (performance.now() < deadline) {
    attempt++;
    try {
      const result = await action();
      if (await condition(result)) return result;
    } catch {
      // Action failed - retry
    }
    if (performance.now() < deadline) {
      if (options.label) console.log(`${options.label}Attempt ${attempt} (${options.intervalMs}ms)...`);
      await sleep(options.intervalMs);
    }
  }
  return null;
}

/**
 * Submits the search form in a tight retry loop.
 */
export async function submitWithRetry(
  page: Page,
  agentLabel = '',
  maxDurationMs = 3000,
  intervalMs = 200,
): Promise<boolean> {
  const result = await pollUntil(
    async () => {
      await submitSearchForm(page);
      return page.evaluate(() => {
        const body = document.body.textContent ?? '';
        return (
          Boolean(document.querySelector('#calendar .br')) ||
          body.includes('0 site(s) available') ||
          body.includes('beyond Reservation Window')
        );
      });
    },
    (hasResults) => hasResults,
    { maxDurationMs, intervalMs, label: agentLabel }
  );

  return Boolean(result);
}

/**
 * Navigates directly to a site booking URL with retry logic.
 */
export async function snipeDirectUrl(
  page: Page,
  url: string,
  agentLabel = '',
  maxDurationMs = 3000,
  intervalMs = 200,
): Promise<boolean> {
  const result = await pollUntil(
    async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 5000 });
      return page.evaluate(() => ({
        ready: Boolean(document.querySelector('#booksiteform')) || Boolean(document.querySelector('#arrivaldate')),
        notAvailable: (document.body.textContent ?? '').toLowerCase().includes('not available')
      }));
    },
    (res) => res.ready || res.notAvailable,
    { maxDurationMs, intervalMs, label: agentLabel }
  );

  return Boolean(result?.ready);
}

/**
 * Pre-warms TCP/TLS connections by making a lightweight HEAD request.
 */
export async function preWarmConnections(page: Page, agentLabel = '') {
  try {
    await page.evaluate((url) => fetch(url, { method: 'HEAD' }).catch(() => { }), PARK_URL);
    console.log(`${agentLabel}Connection pre-warmed.`);
  } catch {
    // Non-critical — silently ignore
  }
}
