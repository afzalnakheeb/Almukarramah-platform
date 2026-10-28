import { Link } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Button, Card, Serif, T, Tag, useWide } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';
import { Seo } from '@/components/seo';

type Settings = { store_open: boolean; checkout_open: boolean; ads_paused: boolean };
type Sales = { day: string; currency: string; orders: number; total_minor: number };

// Update these as each integration goes live (they are set up from Claude).
const INTEGRATIONS: [string, 'live' | 'pending'][] = [
  ['Database and sign-in (Supabase)', 'live'],
  ['Website hosting (Vercel)', 'live'],
  ['Payments (Moyasar)', 'pending'],
  ['Courier rates and tracking', 'pending'],
  ['ZATCA Phase 2 reporting', 'pending'],
  ['App Store / Google Play billing', 'pending'],
];

function confirm(message: string, action: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(message)) action();
  } else {
    Alert.alert(message, undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: action }]);
  }
}

export default function AdminHome() {
  const wide = useWide();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [sales, setSales] = useState<Sales[]>([]);
  const [lowStock, setLowStock] = useState<{ id: string; name_en: string; stock: number }[]>([]);
  const [unreported, setUnreported] = useState(0);
  const [pending, setPending] = useState(0);

  const load = useCallback(async () => {
    const [s, d, l, inv, p] = await Promise.all([
      supabase.from('store_settings').select('store_open, checkout_open, ads_paused').eq('id', 1).single(),
      supabase.from('daily_sales').select('*').order('day', { ascending: false }).limit(7),
      supabase.from('low_stock').select('*'),
      supabase.from('invoices_not_reported').select('id', { count: 'exact', head: true }),
      supabase.from('orders').select('id', { count: 'exact', head: true }).in('status', ['paid', 'packing']),
    ]);
    setSettings(s.data as Settings);
    setSales((d.data as Sales[]) ?? []);
    setLowStock(l.data ?? []);
    setUnreported(inv.count ?? 0);
    setPending(p.count ?? 0);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(key: keyof Settings) {
    if (!settings) return;
    await supabase.from('store_settings').update({ [key]: !settings[key], updated_at: new Date().toISOString() }).eq('id', 1);
    load();
  }

  const week = sales.reduce((n, s) => n + s.orders, 0);
  const tiles: { label: string; value: string; note: string; href?: string; warn?: boolean }[] = [
    { label: 'Orders to pack', value: String(pending), note: 'Paid or being prepared', href: '/admin/orders' },
    { label: 'Low stock items', value: String(lowStock.length), note: lowStock.slice(0, 2).map((x) => x.name_en).join(' · ') || 'Nothing low', href: '/admin/products' },
    { label: 'Invoices not yet reported', value: String(unreported), note: 'ZATCA Phase 2 queue', warn: unreported > 0 },
    { label: 'Paid orders, last 7 days', value: String(week), note: sales[0] ? `Latest day ${formatMoney(sales[0].total_minor, sales[0].currency)}` : 'No paid orders yet' },
  ];

  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Seo title="Admin | Al Mukarramah" description="Staff only." path="/admin" noindex />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <Serif role="h1" size={wide ? 40 : 32}>Admin</Serif>
      </View>
      <T size={13} color={colors.muted} style={{ marginBottom: 20 }}>Backup panel. Every change here is recorded in the audit log, the same as changes made from Claude.</T>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {tiles.map((x) => {
          const body = (
            <Card pad={18} style={{ flexGrow: 1, flexBasis: wide ? 220 : '45%', gap: 4, borderColor: x.warn ? colors.danger : colors.line }}>
              <T size={12.5} color={colors.muted}>{x.label}</T>
              <T w={700} size={30} color={x.warn ? colors.danger : colors.navy}>{x.value}</T>
              <T size={12} color={colors.muted} numberOfLines={1}>{x.note}</T>
            </Card>
          );
          return x.href ? <Link key={x.label} href={x.href as never} asChild><Pressable accessibilityRole="link" style={{ flexGrow: 1, flexBasis: wide ? 220 : '45%' }}>{body}</Pressable></Link> : <React.Fragment key={x.label}>{body}</React.Fragment>;
        })}
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, marginTop: 18, alignItems: 'flex-start' }}>
        <Card pad={20} style={{ flex: 1.2, alignSelf: 'stretch', gap: 12 }}>
          <T w={700} size={17} color={colors.navy}>Emergency controls</T>
          {settings ? (
            <>
              <Control label="Store" on={settings.store_open} onText="Open to customers" offText="Closed to customers"
                button={settings.store_open ? 'Close the store' : 'Reopen the store'}
                onPress={() => confirm(settings.store_open ? 'Close the store for all customers?' : 'Reopen the store?', () => toggle('store_open'))} />
              <Control label="Checkout" on={settings.checkout_open} onText="Taking orders" offText="Paused"
                button={settings.checkout_open ? 'Pause checkout' : 'Resume checkout'}
                onPress={() => confirm('Change checkout?', () => toggle('checkout_open'))} />
              <Control label="Ads" on={!settings.ads_paused} onText="Running as planned" offText="Flagged to pause — Claude pauses the live campaigns"
                button={settings.ads_paused ? 'Clear the pause flag' : 'Flag: pause all ads'} secondary
                onPress={() => confirm(settings.ads_paused ? 'Clear the ads pause flag?' : 'Flag all ads to be paused? Claude will pause the live campaigns.', () => toggle('ads_paused'))} />
            </>
          ) : <T color={colors.muted}>Loading…</T>}
        </Card>

        <Card pad={20} style={{ flex: 1, alignSelf: 'stretch', gap: 10 }}>
          <T w={700} size={17} color={colors.navy}>Integrations</T>
          {INTEGRATIONS.map(([name, state]) => (
            <View key={name} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
              <T size={14} style={{ flex: 1 }}>{name}</T>
              <Tag label={state === 'live' ? 'Connected' : 'Not connected'} tone={state === 'live' ? 'ok' : 'sample'} />
            </View>
          ))}
        </Card>
      </View>

      <Card pad={20} style={{ marginTop: 16, gap: 8 }}>
        <T w={700} size={17} color={colors.navy}>Sales, last 7 days</T>
        {sales.length === 0 ? <T color={colors.muted}>No paid orders yet.</T> : sales.map((s) => (
          <View key={s.day + s.currency} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderColor: colors.lineSoft }}>
            <T size={14}>{s.day}</T>
            <T size={14} color={colors.muted}>{s.orders} orders</T>
            <T w={700} size={14} color={colors.navy}>{formatMoney(s.total_minor, s.currency)}</T>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function Control({ label, on, onText, offText, button, onPress, secondary }: { label: string; on: boolean; onText: string; offText: string; button: string; onPress: () => void; secondary?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: colors.lineSoft }}>
      <View style={{ flex: 1, minWidth: 180, gap: 4 }}>
        <T w={700} size={14}>{label}</T>
        <Tag label={on ? onText : offText} tone={on ? 'ok' : 'err'} />
      </View>
      <Button size="sm" label={button} kind={secondary ? 'secondary' : on ? 'danger' : 'primary'} onPress={onPress} />
    </View>
  );
}
