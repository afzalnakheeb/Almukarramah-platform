// Backup admin panel — follows AdminHome.dc.html (navy sidebar, internal workspace).
// Day-to-day work is done from Claude; this is for emergencies and quick checks.
import { Link, Redirect, Stack, usePathname, type Href } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '@/components/chrome';
import { Loading, T, useHydrated, useWide } from '@/components/ui';
import { MARKET_DEMO } from '@/lib/market';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

const LINKS: { href: Href; label: string; group?: string }[] = [
  { href: '/admin', label: 'Home' },
  { href: '/admin/orders', label: 'Orders', group: 'Customers' },
  { href: '/admin/returns', label: 'Returns and refunds' },
  { href: '/admin/reviews', label: 'Reviews to publish' },
  { href: '/admin/messages', label: 'Conversations' },
  { href: '/admin/notifications', label: 'Notifications outbox' },
  { href: '/admin/products', label: 'Products & stock', group: 'Catalogue' },
  { href: '/admin/drafts', label: 'Drafts to approve' },
  { href: '/admin/listings', label: 'Seller listings to approve', group: 'Marketplace' },
  { href: '/admin/sellers', label: 'Sellers and partners' },
  { href: '/admin/payouts', label: 'Seller payouts' },
  { href: '/admin/performance', label: 'Seller performance' },
  { href: '/admin/audit', label: 'Audit history', group: 'System' },
  { href: '/', label: '← Back to the shop', group: ' ' },
];

export default function AdminLayout() {
  const wide = useWide();
  const path = usePathname();
  const { session, staffRole: role, loading } = useSession();
  // The screenshot build (EXPO_PUBLIC_MARKET_DEMO=1, served on localhost) shows the marketplace pages with example
  // data and no sign-in. Anywhere else, and in every real build, staff sign in as usual.
  const hydrated = useHydrated();
  const demo = MARKET_DEMO && hydrated && typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const staffRole = demo ? 'demo' : role;
  if (loading && !demo) return <View style={{ flex: 1, backgroundColor: colors.ivory }}><Loading /></View>;
  // Not signed in (or not staff): sign in first, then come straight back here.
  if (!demo && (!session || !staffRole)) return <Redirect href={{ pathname: '/account', params: { next: path } }} />;

  const active = (h: Href) => (h === '/admin' ? path === '/admin' : path === h);

  return (
    <SafeAreaView style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: colors.ivory }} edges={['top']}>
      {wide ? (
        <View style={{ width: 248, backgroundColor: colors.navyDeep, paddingVertical: 22, paddingHorizontal: 14, gap: 2 }}>
          <View style={{ paddingHorizontal: 10 }}><Logo height={34} white /></View>
          <T size={12} color="#9EA1BD" style={{ paddingHorizontal: 10, marginTop: 8, marginBottom: 14 }}>Internal workspace · {staffRole}</T>
          {LINKS.map((l, i) => (
            <View key={String(l.href)}>
              {l.group && l.group !== LINKS[i - 1]?.group ? <T w={700} size={11} color="#7F83A6" style={{ paddingHorizontal: 10, marginTop: 14, marginBottom: 4, letterSpacing: 1.2, textTransform: 'uppercase' }}>{l.group}</T> : null}
              <Link href={l.href} style={{ paddingVertical: 9, paddingHorizontal: 10, borderRadius: 9, backgroundColor: active(l.href) ? '#1B2370' : 'transparent' }}>
                <T w={active(l.href) ? 700 : 500} size={13.5} color={active(l.href) ? colors.white : '#C9CBDB'}>{l.label}</T>
              </Link>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ backgroundColor: colors.navyDeep, paddingTop: 10 }}>
          <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Logo height={26} white />
            <T size={12} color="#9EA1BD">Admin · {staffRole}</T>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 4 }}>
            {LINKS.map((l) => (
              <Link key={String(l.href)} href={l.href} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: active(l.href) ? '#1B2370' : 'transparent' }}>
                <T w={600} size={13} color={active(l.href) ? colors.white : '#C9CBDB'}>{l.label}</T>
              </Link>
            ))}
          </ScrollView>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }} />
      </View>
    </SafeAreaView>
  );
}
