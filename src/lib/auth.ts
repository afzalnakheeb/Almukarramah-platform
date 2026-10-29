// Sign-in helpers. Google sign-in uses Supabase Auth (Google provider), so the account is the same everywhere.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isConfigured, supabase } from '@/lib/supabase';

const NEXT_KEY = 'postLoginNext';
const safe = (p?: string) => (p && p.startsWith('/') && !p.startsWith('//') ? p : undefined);

/** Remembers the page to open after sign-in (kept 30 minutes), so the visitor gets there even if the
 *  sign-in service returns them to a different page. */
export async function rememberNext(next?: string): Promise<void> {
  const p = safe(next);
  if (p) await AsyncStorage.setItem(NEXT_KEY, JSON.stringify({ p, t: Date.now() })).catch(() => undefined);
}
/** Returns (and forgets) the remembered page, if any. */
export async function takeNext(): Promise<string | undefined> {
  try {
    const raw = await AsyncStorage.getItem(NEXT_KEY);
    if (!raw) return undefined;
    await AsyncStorage.removeItem(NEXT_KEY);
    const { p, t } = JSON.parse(raw) as { p: string; t: number };
    return Date.now() - t < 30 * 60 * 1000 ? safe(p) : undefined;
  } catch { return undefined; }
}

/** Opens Google sign-in. On the website the page returns to /account; in the apps an in-app browser is used. */
/** `next`: a page on this site to open after signing in (e.g. /admin). */
export async function signInWithGoogle(next?: string): Promise<void> {
  const back = safe(next) ? `/account?next=${encodeURIComponent(next!)}` : '/account';
  await rememberNext(next);
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${back}`, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
    return;
  }
  const redirectTo = Linking.createURL(back);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data?.url) throw error ?? new Error('Google sign-in is not available');
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return; // cancelled
  const code = new URL(result.url).searchParams.get('code');
  if (!code) throw new Error('Google sign-in did not complete');
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr) throw exErr;
}

let googleCheck: Promise<boolean> | null = null;
/** True when the Google provider is switched on in Supabase Auth (public settings endpoint, checked once). */
export function googleEnabled(): Promise<boolean> {
  if (!isConfigured) return Promise.resolve(false);
  googleCheck ??= fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' },
  })
    .then((r) => r.json())
    .then((s: { external?: { google?: boolean } }) => !!s.external?.google)
    .catch(() => false);
  return googleCheck;
}
