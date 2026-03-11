import { extractSiteIds, normalizeSiteId } from './site-id';

export type CartConfirmationSource =
  | 'cart-url'
  | 'cart-body'
  | 'requested-site'
  | 'cart-count-increase'
  | 'checkout-login'
  | 'none';

export type CartConfirmationInput = {
  finalUrl: string;
  bodyText: string;
  requestedSite: string;
  cartSitesBefore: string[];
  cartSitesAfter: string[];
  checkoutLoginDetected: boolean;
};

export function extractCartSiteIds(bodyText: string): string[] {
  return extractSiteIds(bodyText);
}

export function isCartUrl(url: string): boolean {
  return url.includes('viewShoppingCart.do') || url.includes('shoppingCart.do');
}

export function hasCartBodyConfirmation(bodyText: string): boolean {
  return bodyText.toLowerCase().includes('shopping cart');
}

export function determineCartConfirmation(input: CartConfirmationInput): {
  success: boolean;
  source: CartConfirmationSource;
} {
  const requestedSite = normalizeSiteId(input.requestedSite);
  const cartSitesBefore = input.cartSitesBefore.map((siteId) => normalizeSiteId(siteId));
  const cartSitesAfter = input.cartSitesAfter.map((siteId) => normalizeSiteId(siteId));

  if (isCartUrl(input.finalUrl)) {
    return { success: true, source: 'cart-url' };
  }

  if (!input.checkoutLoginDetected && hasCartBodyConfirmation(input.bodyText)) {
    return { success: true, source: 'cart-body' };
  }

  if (cartSitesAfter.includes(requestedSite)) {
    return { success: true, source: 'requested-site' };
  }

  if (cartSitesAfter.length > cartSitesBefore.length) {
    return { success: true, source: 'cart-count-increase' };
  }

  if (input.checkoutLoginDetected) {
    return { success: false, source: 'checkout-login' };
  }

  return { success: false, source: 'none' };
}
