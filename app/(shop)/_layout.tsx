import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { Icon, type IconName } from '@/components/icons';
import { useCart } from '@/lib/cart';
import { useI18n } from '@/lib/i18n';
import { colors, sans } from '@/theme';

/** In the apps: the bottom tab bar from the app design. On the website the header navigation replaces it. */
export default function ShopTabs() {
  const { t, isRTL } = useI18n();
  const { count } = useCart();
  const icon = (name: IconName) => ({ color }: { color: string }) => <Icon name={name} size={22} color={color} stroke={1.7} />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { ...sans(700, isRTL), fontSize: 11 },
        tabBarStyle: Platform.OS === 'web' ? { display: 'none' } : { backgroundColor: colors.white, borderTopColor: colors.line },
        tabBarBadgeStyle: { backgroundColor: colors.brass, color: colors.white, fontSize: 10 },
      }}>
      <Tabs.Screen name="index" options={{ title: t('home'), tabBarIcon: icon('house') }} />
      <Tabs.Screen name="shop" options={{ title: t('shop'), tabBarIcon: icon('grid') }} />
      <Tabs.Screen name="cart" options={{ title: t('cart'), tabBarBadge: count > 0 ? count : undefined, tabBarIcon: icon('bag') }} />
      <Tabs.Screen name="account" options={{ title: t('account'), tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
