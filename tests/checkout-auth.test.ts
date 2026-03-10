import { isAuthenticatedBodyText, looksLikeCheckoutLoginPage } from '../src/checkout-auth';

describe('checkout auth helpers', () => {
  test('detects authenticated account chrome from sign-out text', () => {
    expect(isAuthenticatedBodyText('Welcome back. Member Sign Out')).toBe(true);
    expect(isAuthenticatedBodyText('Navigation with My Account only')).toBe(false);
  });

  test('detects checkout sign-in from explicit checkout messaging', () => {
    expect(looksLikeCheckoutLoginPage({
      bodyText: 'Sign In to Continue with Checkout',
      url: 'https://utahstateparks.reserveamerica.com/foo',
      title: 'ReserveAmerica',
    })).toBe(true);
  });

  test('detects checkout sign-in from redirect url', () => {
    expect(looksLikeCheckoutLoginPage({
      bodyText: 'Regular page body',
      url: 'https://utahstateparks.reserveamerica.com/memberSignInSignUp.do',
      title: 'ReserveAmerica',
    })).toBe(true);
  });

  test('does not misclassify ordinary signed-in pages as checkout sign-in', () => {
    expect(looksLikeCheckoutLoginPage({
      bodyText: 'My Account Sign Out',
      url: 'https://utahstateparks.reserveamerica.com/memberAccountHome.do',
      title: 'My Account',
    })).toBe(false);
  });

  test('does not misclassify an authenticated shopping cart page that keeps the sign-in url', () => {
    expect(looksLikeCheckoutLoginPage({
      bodyText: 'Sign In / Sign Up My Account My Reservations Shopping Cart This Shopping Cart is empty',
      url: 'https://utahstateparks.reserveamerica.com/memberSignInSignUp.do',
      title: 'Shopping Cart - Utah State Parks',
    })).toBe(false);
  });
});
