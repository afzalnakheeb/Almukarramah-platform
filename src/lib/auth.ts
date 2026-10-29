// Sign-in helpers. Google sign-in uses Supabase Auth (Google provider), so the account is the same everywhere.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';


/** Opens Google sign-in. On the website the page returns to /account; in the apps an in-app browser is used. */
export async function signInWithGoogle(): Promise<void> {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/account`, queryParams: { prompt: 'select_account' } },
    });
    if (error) throw error;
    return;
  }
  const redirectTo = Linking.createURL('/account');
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
