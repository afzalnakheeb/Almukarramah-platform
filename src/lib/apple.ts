// Sign in with Apple lives in apple.ios.ts (iPhone and iPad). On the website and Android these do nothing, so the
// shared screens can call them without checking the platform first.

export async function appleAvailable(): Promise<boolean> {
  return false;
}

/** Signs in with Apple through Supabase. Resolves 'cancelled' when the person closes Apple's sheet. */
export async function signInWithApple(): Promise<'signed_in' | 'cancelled'> {
  return 'cancelled';
}

/** A fresh Apple authorization code, so the server can revoke Apple's tokens when the account is deleted
 *  (Apple asks apps to do this). null when there is none; 'cancelled' when the person closed Apple's sheet. */
export async function appleAuthorizationCode(): Promise<string | null | 'cancelled'> {
  return null;
}
