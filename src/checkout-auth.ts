export function isAuthenticatedBodyText(bodyText: string): boolean {
  return bodyText.includes('Sign Out') || bodyText.includes('Member Sign Out');
}

type CheckoutLoginSignals = {
  bodyText: string;
  url: string;
  title: string;
};

export function looksLikeCheckoutLoginPage({ bodyText, url, title }: CheckoutLoginSignals): boolean {
  if (bodyText.includes('Sign In to Continue with Checkout')) return true;
  if (url.includes('memberSignInSignUp.do') || url.includes('memberSignIn.do')) return true;
  return title.includes('Sign In');
}
