import {
  determineCartConfirmation,
  extractCartSiteIds,
} from '../src/cart-detection';

describe('cart detection helpers', () => {
  test('treats a cart URL redirect as success', () => {
    expect(determineCartConfirmation({
      finalUrl: 'https://utahstateparks.reserveamerica.com/viewShoppingCart.do',
      bodyText: '',
      requestedSite: 'BH03',
      cartSitesBefore: [],
      cartSitesAfter: [],
      checkoutLoginDetected: false,
    })).toEqual({
      success: true,
      source: 'cart-url',
    });
  });

  test('treats shopping cart body text as success', () => {
    expect(determineCartConfirmation({
      finalUrl: 'https://utahstateparks.reserveamerica.com/switchBookingAction.do',
      bodyText: 'Shopping Cart\nReservation Summary',
      requestedSite: 'BH03',
      cartSitesBefore: [],
      cartSitesAfter: [],
      checkoutLoginDetected: false,
    })).toEqual({
      success: true,
      source: 'cart-body',
    });
  });

  test('treats the requested site appearing in cart as success without redirect', () => {
    expect(determineCartConfirmation({
      finalUrl: 'https://utahstateparks.reserveamerica.com/switchBookingAction.do',
      bodyText: 'Order Details',
      requestedSite: 'BH11',
      cartSitesBefore: ['BH03'],
      cartSitesAfter: ['BH03', 'BH11'],
      checkoutLoginDetected: false,
    })).toEqual({
      success: true,
      source: 'requested-site',
    });
  });

  test('treats cart count growth as success when site label is missing', () => {
    expect(determineCartConfirmation({
      finalUrl: 'https://utahstateparks.reserveamerica.com/switchBookingAction.do',
      bodyText: 'Order Details',
      requestedSite: 'BH11',
      cartSitesBefore: ['BH03'],
      cartSitesAfter: ['BH03', 'BH07'],
      checkoutLoginDetected: false,
    })).toEqual({
      success: true,
      source: 'cart-count-increase',
    });
  });

  test('returns failure when neither page state nor cart diff confirms success', () => {
    expect(determineCartConfirmation({
      finalUrl: 'https://utahstateparks.reserveamerica.com/switchBookingAction.do',
      bodyText: 'Order Details',
      requestedSite: 'BH11',
      cartSitesBefore: ['BH03'],
      cartSitesAfter: ['BH03'],
      checkoutLoginDetected: false,
    })).toEqual({
      success: false,
      source: 'none',
    });
  });

  test('does not misclassify checkout sign-in pages as success', () => {
    expect(determineCartConfirmation({
      finalUrl: 'https://utahstateparks.reserveamerica.com/memberSignIn.do',
      bodyText: 'Sign In to Continue',
      requestedSite: 'BH11',
      cartSitesBefore: ['BH03'],
      cartSitesAfter: ['BH03'],
      checkoutLoginDetected: true,
    })).toEqual({
      success: false,
      source: 'checkout-login',
    });
  });

  test('extracts unique BH site IDs from cart text', () => {
    expect(extractCartSiteIds('BH03\nBH11\nBH03\nOther text')).toEqual(['BH03', 'BH11']);
  });

  test('extracts site IDs even when the cart label is glued to the site code', () => {
    expect(extractCartSiteIds('STANDARD-FULL HOOKUPBH03, BIRCH')).toEqual(['BH03']);
  });
});
