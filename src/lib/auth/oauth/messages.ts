/** Client-safe: no Node imports, so the sign-in page can use it. */

/** Messages for the codes the sign-in page can receive. */
export const OAUTH_ERRORS: Record<string, string> = {
  cancelled: "Sign-in was cancelled.",
  not_configured: "That sign-in option isn't set up yet.",
  expired: "The sign-in took too long or was opened in another browser. Try again.",
  token_exchange_failed: "The provider didn't accept the sign-in. Try again.",
  profile_failed: "The provider didn't share your profile. Try again.",
  no_identity: "The provider didn't return an account. Try another option.",
  email_in_use: "An account with this email already exists. Sign in with your password, then connect this provider in Settings.",
  linked_elsewhere: "That provider account is already connected to a different Banyan account.",
  signin_required: "Sign in first, then connect the provider from Settings.",
  unavailable: "Banyan couldn't finish signing you in. Try again in a moment.",
};
