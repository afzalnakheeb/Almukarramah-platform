import { Amiri_400Regular, Amiri_700Bold } from '@expo-google-fonts/amiri';
import { CormorantGaramond_600SemiBold } from '@expo-google-fonts/cormorant-garamond';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold } from '@expo-google-fonts/manrope';
import { ReadexPro_400Regular, ReadexPro_500Medium, ReadexPro_600SemiBold } from '@expo-google-fonts/readex-pro';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AssistantDock } from '@/components/assistant';
import { AssistantProvider } from '@/lib/assistant';
import { takeNext } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { loadRates } from '@/lib/catalogue';
import { I18nProvider } from '@/lib/i18n';
import { PrefsProvider } from '@/lib/prefs';
import { initPurchases } from '@/lib/purchases';
import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/theme';

function Boot() {
  const { session } = useSession();
  useEffect(() => {
    loadRates().catch(() => undefined);
  }, []);
  useEffect(() => {
    initPurchases(session?.user.id ?? null);
  }, [session?.user.id]);
  // After signing in, open the page the visitor was going to (e.g. /admin), wherever sign-in returned them.
  useEffect(() => {
    if (!session) return;
    takeNext().then((p) => {
      if (!p || (Platform.OS === 'web' && window.location.pathname === p)) return;
      router.replace(p as never);
    });
  }, [session?.user.id]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_600SemiBold,
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold, Manrope_700Bold,
    Amiri_400Regular, Amiri_700Bold,
    ReadexPro_400Regular, ReadexPro_500Medium, ReadexPro_600SemiBold,
  });
  // Never block the shop on a slow font download: show the page after 2.5 s with system fonts.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setTimedOut(true), 2500);
    return () => clearTimeout(id);
  }, []);
  // On the website the page renders straight away (pre-rendered HTML must never be blank); the apps wait briefly for fonts.
  if (Platform.OS !== 'web' && !fontsLoaded && !fontError && !timedOut) return <View style={{ flex: 1, backgroundColor: colors.ivory }} />;

  const web = Platform.OS === 'web';
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <PrefsProvider>
          <SessionProvider>
            <CartProvider>
              <AssistantProvider>
              <Boot />
              <StatusBar style="dark" />
              <Stack
                screenOptions={{
                  headerShown: !web,
                  headerTintColor: colors.navy,
                  headerTitle: '',
                  headerShadowVisible: false,
                  headerStyle: { backgroundColor: colors.white },
                  contentStyle: { backgroundColor: colors.ivory },
                }}>
                <Stack.Screen name="(shop)" options={{ headerShown: false }} />
                <Stack.Screen name="admin" options={{ headerShown: false }} />
              </Stack>
              <AssistantDock />
              </AssistantProvider>
            </CartProvider>
          </SessionProvider>
        </PrefsProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
