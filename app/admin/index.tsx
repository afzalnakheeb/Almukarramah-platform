import { Link } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { Button, H1, Notice, Screen, Section } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { colors, radius, space, type } from '@/theme';

type Settings = { store_open: boolean; checkout_open: boolean; ads_paused: boolean };
type Sales = { day: string; currency: string; orders: number; total_minor: number };

function confirm(message: string, action: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(message)) action();
  } else {
    Alert.alert(message, undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes', style: 'destructive', onPress: action }]);
  }
}

export default function AdminHome() {
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

  return (
    <Screen>
      <H1>Admin</H1>
      <Text style={type.small}>Backup panel. Every change here is recorded in the audit log, the same as changes made from Claude.</Text>

      <Section title="Emergency controls">
        {settings && (
          <View style={{ gap: space(1) }}>
            <Button
              kind={settings.store_open ? 'danger' : 'primary'}
              label={settings.store_open ? 'Close the store' : 'Reopen the store'}
              onPress={() => confirm(settings.store_open ? 'Close the store for all customers?' : 'Reopen the store?', () => toggle('store_open'))}
            />
            <Button
              kind={settings.checkout_open ? 'danger' : 'primary'}
              label={settings.checkout_open ? 'Pause checkout' : 'Resume checkout'}
              onPress={() => confirm('Change checkout?', () => toggle('checkout_open'))}
            />
            <Button
              kind="secondary"
              label={settings.ads_paused ? 'Ads flagged as paused (Claude pauses them)' : 'Flag: pause all ads'}
              onPress={() => confirm('Flag all ads to be paused? Claude will pause the live campaigns.', () => toggle('ads_paused'))}
            />
          </View>
        )}
      </Section>

      <Section title="Today">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1.5) }}>
          <Tile label="Orders to pack" value={String(pending)} />
          <Tile label="Low stock items" value={String(lowStock.length)} />
          <Tile label="Invoices not yet reported to ZATCA" value={String(unreported)} warn={unreported > 0} />
        </View>
      </Section>

      <Section title="Sales, last 7 days">
        {sales.length === 0 ? <Notice text="No paid orders yet." /> : sales.map((s) => (
          <Text key={s.day + s.currency} style={type.body}>{s.day} · {s.orders} orders · {formatMoney(s.total_minor, s.currency)}</Text>
        ))}
      </Section>

      <Section title="Manage">
        <View style={{ gap: space(1) }}>
          <Link href="/admin/orders" style={linkStyle}>Orders, refunds and invoices →</Link>
          <Link href="/admin/products" style={linkStyle}>Products and stock →</Link>
          <Link href="/admin/audit" style={linkStyle}>Audit log →</Link>
        </View>
      </Section>
    </Screen>
  );
}

const linkStyle = { color: colors.navy, fontWeight: '700' as const, fontSize: 16 };

function Tile({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <View style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: warn ? colors.danger : colors.line, borderRadius: radius.md, padding: space(2), minWidth: 160, flexGrow: 1 }}>
      <Text style={[type.display, warn && { color: colors.danger }]}>{value}</Text>
      <Text style={type.small}>{label}</Text>
    </View>
  );
}
