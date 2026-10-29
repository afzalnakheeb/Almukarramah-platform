import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** False until the Supabase project is connected; the app then shows the demo catalogue. */
export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(isConfigured ? url : 'https://demo.supabase.co', isConfigured ? anonKey : 'demo-key', {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: isConfigured,
    persistSession: isConfigured,
    detectSessionInUrl: Platform.OS === 'web' && isConfigured,
    // PKCE: Google sign-in returns a one-time code that is exchanged for the session (web and apps).
    flowType: 'pkce',
  },
});

export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  if (!isConfigured) throw new Error('Demo mode: payments, delivery quotes and the concierge work once the Supabase project is connected.');
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) throw error;
  return data as T;
}
