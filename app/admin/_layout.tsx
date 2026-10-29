// Backup admin panel — follows AdminHome.dc.html (navy sidebar, internal workspace).
// Day-to-day work is done from Claude; this is for emergencies and quick checks.
import { Link, Redirect, Stack, usePathname, type Href } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '@/components/chrome';
import { Loading, T, useWide } from '@/components/ui';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

const LINKS: { href: Href; label: string; group?: string }[] = [
  { href: '/admin', label: 'Home' },
  { href: '/admin/orders', label: 'Orders & refunds', group: 'Customers' },
  { href: '/admin/products', label: 'Products & stock', group: 'Catalogue' },
  { href: '/admin/drafts', label: 'Drafts to approve' },
  { href: '/admin/audit', label: 'Audit history', group: 'System' },
  { href: '/', label: '← Back to the shop', group: ' ' },
];

export default function AdminLayout() {
  const wide = useWide();
  const path = usePathname();
  const { session, staffRole, loading } = useSession();
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.ivory }}><Loading /></View>;
  if (!session || !staffRole) return <Redirect href="/account" />;

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
