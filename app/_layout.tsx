import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CartProvider } from '@/lib/cart';
import { loadRates } from '@/lib/catalogue';
import { I18nProvider } from '@/lib/i18n';
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
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <SessionProvider>
          <CartProvider>
            <Boot />
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerTintColor: colors.navy, contentStyle: { backgroundColor: colors.cream } }}>
              <Stack.Screen name="(shop)" options={{ headerShown: false }} />
              <Stack.Screen name="product/[slug]" options={{ title: '' }} />
              <Stack.Screen name="checkout" options={{ title: '' }} />
              <Stack.Screen name="membership" options={{ title: '' }} />
              <Stack.Screen name="trail/[slug]" options={{ title: '' }} />
              <Stack.Screen name="concierge" options={{ title: '' }} />
              <Stack.Screen name="admin" options={{ headerShown: false }} />
            </Stack>
          </CartProvider>
        </SessionProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
