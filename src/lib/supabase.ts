import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { AppError, fromFunction } from './app-error';

export { AppError, fromDb } from './app-error';

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
  if (!isConfigured) {
    throw new AppError({
      en: 'Demo mode: payments, delivery quotes and the concierge work once the Supabase project is connected.',
      ar: 'وضع العرض: يعمل الدفع وأسعار التوصيل والمساعد بعد ربط المشروع بقاعدة البيانات.',
    });
  }
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (error) throw await fromFunction(error);
  return data as T;
}
