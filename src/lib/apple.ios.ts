// Sign in with Apple on iPhone and iPad (App Store Guideline 4.8: the app offers Google sign-in, so it also offers
// Apple's). Apple's native sheet returns an identity token; Supabase Auth checks it and signs the person in
// (Apple provider, Client ID com.almukarramah.app: see docs/app-stores.md).
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/supabase';

const cancelled = (e: unknown) => (e as { code?: string } | null)?.code === 'ERR_REQUEST_CANCELED';

export async function appleAvailable(): Promise<boolean> {
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function signInWithApple(): Promise<'signed_in' | 'cancelled'> {
  // A one-time nonce: Apple puts its SHA-256 into the identity token and Supabase checks it against the raw value,
  // so a token can never be replayed.
  const raw = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
  } catch (e) {
    if (cancelled(e)) return 'cancelled';
    throw e;
  }
  if (!credential.identityToken) throw new Error('Apple did not return an identity token');
  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: raw });
  if (error) throw error;

  // Apple shares the name only the first time someone signs in to the app, and never inside the token: keep it.
  const n = credential.fullName;
  const fullName = [n?.givenName, n?.middleName, n?.familyName].filter(Boolean).join(' ').trim();
  if (fullName && data.user) {
    await supabase.auth.updateUser({ data: { full_name: fullName } }).catch(() => undefined);
    await supabase.from('profiles').update({ full_name: fullName }).eq('id', data.user.id).is('full_name', null)
      .then(() => undefined, () => undefined);
  }
  return 'signed_in';
}

export async function appleAuthorizationCode(): Promise<string | null | 'cancelled'> {
  try {
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
    return credential.authorizationCode ?? null;
  } catch (e) {
    return cancelled(e) ? 'cancelled' : null;
  }
}
