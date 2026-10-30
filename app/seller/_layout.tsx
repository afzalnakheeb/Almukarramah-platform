// Seller dashboard shell: signed-in sellers only. Night sidebar with gold, like the admin panel.
import { Link, Redirect, Stack, usePathname, type Href } from 'expo-router';
import React from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '@/components/chrome';
import { Loading, T, Tag, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import { useMySeller } from '@/lib/seller';
import { SellerProvider, STATUS_TONE } from '@/lib/seller-context';
import { colors } from '@/theme';

const LINKS: { href: Href; label: Key }[] = [
  { href: '/seller', label: 'sdOverview' },
  { href: '/seller/products', label: 'sdProducts' },
  { href: '/seller/orders', label: 'sdOrders' },
  { href: '/seller/shop', label: 'sdShop' },
  { href: '/seller/application', label: 'sdApplication' },
  { href: '/sell/guidelines', label: 'sellerGuidelines' },
  { href: '/', label: 'backToShop' },
];

export default function SellerLayout() {
  const wide = useWide();
  const path = usePathname();
  const { t } = useI18n();
  const { me, loading, reload, session } = useMySeller();
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.ivory }}><Loading /></View>;
  if (!session) return <Redirect href={{ pathname: '/account', params: { next: path } }} />;
  if (!me) return <Redirect href="/sell" />;

  const active = (h: Href) => (h === '/seller' ? path === '/seller' : path.startsWith(String(h)));
  const status = <Tag label={t(`sellerStatus_${me.seller.status}` as Key)} tone={STATUS_TONE[me.seller.status]} />;

  return (
    <SellerProvider value={{ me, reload }}>
      <SafeAreaView style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: colors.ivory }} edges={['top']}>
        {wide ? (
          <View style={{ width: 256, backgroundColor: colors.night, paddingVertical: 22, paddingHorizontal: 14, gap: 2, borderEndWidth: 1, borderColor: colors.goldLine }}>
            <View style={{ paddingHorizontal: 10 }}><Logo height={34} white /></View>
            <View style={{ paddingHorizontal: 10, marginTop: 10, marginBottom: 16, gap: 6 }}>
              <T w={700} size={14} color={colors.goldBright} numberOfLines={2}>{me.seller.name_en}</T>
              {status}
            </View>
            {LINKS.map((l) => (
              <Link key={String(l.href)} href={l.href} style={{ paddingVertical: 9, paddingHorizontal: 10, borderRadius: 9, backgroundColor: active(l.href) ? colors.nightSoft : 'transparent', borderStartWidth: 2, borderColor: active(l.href) ? colors.gold : 'transparent' }}>
                <T w={active(l.href) ? 700 : 500} size={13.5} color={active(l.href) ? colors.white : colors.onNight}>{t(l.label)}</T>
              </Link>
            ))}
          </View>
        ) : (
          <View style={{ backgroundColor: colors.night, paddingTop: 10, borderBottomWidth: 1, borderColor: colors.gold }}>
            <View style={{ paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Logo height={26} white />
              <View style={{ flexShrink: 1, alignItems: 'flex-end', gap: 4 }}>
                <T w={700} size={12.5} color={colors.goldBright} numberOfLines={1}>{me.seller.name_en}</T>
                {status}
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 4 }}>
              {LINKS.map((l) => (
                <Link key={String(l.href)} href={l.href} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: active(l.href) ? colors.nightSoft : 'transparent' }}>
                  <T w={600} size={13} color={active(l.href) ? colors.white : colors.onNight}>{t(l.label)}</T>
                </Link>
              ))}
            </ScrollView>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.ivory } }} />
        </View>
      </SafeAreaView>
    </SellerProvider>
  );
}
