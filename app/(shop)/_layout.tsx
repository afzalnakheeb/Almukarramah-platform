import { Tabs } from 'expo-router';
import React from 'react';
import { useCart } from '@/lib/cart';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export default function ShopTabs() {
  const { t } = useI18n();
  const { count } = useCart();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.navy, tabBarInactiveTintColor: colors.muted }}>
      <Tabs.Screen name="index" options={{ title: t('home') }} />
      <Tabs.Screen name="shop" options={{ title: t('shop') }} />
      <Tabs.Screen name="cart" options={{ title: t('cart'), tabBarBadge: count > 0 ? count : undefined }} />
      <Tabs.Screen name="account" options={{ title: t('account') }} />
    </Tabs>
  );
}
