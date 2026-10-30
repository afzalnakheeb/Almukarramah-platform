// One order in the account: items, totals, delivery, tracking and tax invoice. Only the shopper (or staff) can read it.
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Seo } from '@/components/seo';
import { Button, Card, Divider, H1, Loading, Notice, Row, T, Tag, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

type Item = { id: string; name_en: string; name_ar: string; quantity: number; unit_price_minor: number; line_total_minor: number };
type Order = {
  id: string; number: number; status: string; currency: string; kind: string | null; created_at: string; paid_at: string | null;
  subtotal_minor: number; shipping_minor: number; discount_minor: number; total_minor: number; vat_minor: number;
  ship_to: Record<string, string> | null; gift_message: string | null; shipping_carrier: string | null; tracking_number: string | null;
  order_items: Item[]; invoices: { id: string; number: string; created_at: string }[];
};

const STEPS = ['paid', 'packing', 'shipped', 'delivered'] as const;
const TONE: Record<string, 'ok' | 'warn' | 'info' | 'err' | 'mute'> = {
  paid: 'info', packing: 'warn', shipped: 'info', delivered: 'ok', pending_payment: 'mute', refunded: 'err', cancelled: 'mute',
};

export default function OrderPage() {
  const wide = useWide();
  const { t, lang, pick } = useI18n();
  const { session } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    if (!session || !id) return;
    supabase
      .from('orders')
      .select('id, number, status, currency, kind, created_at, paid_at, subtotal_minor, shipping_minor, discount_minor, total_minor, vat_minor, ship_to, gift_message, shipping_carrier, tracking_number, order_items(id, name_en, name_ar, quantity, unit_price_minor, line_total_minor), invoices(id, number, created_at)')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        setOrder((data as Order) ?? null);
        setState(data ? 'ready' : 'missing');
      });
  }, [session, id]);

  const money = (m: number) => formatMoney(m, order?.currency ?? 'SAR', lang);
  const date = (s: string) => new Date(s).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const reached = order ? STEPS.indexOf(order.status as (typeof STEPS)[number]) : -1;

  return (
    <Screen>
      <Seo title="Order | Al Mukarramah" description="Your order." path="/order" noindex />
      <Button kind="text" size="sm" label={t('backToAccount')} href="/account" style={{ alignSelf: 'flex-start', marginBottom: 6 }} />
      {!session && <Notice text={t('signInToSeeOrder')} />}
      {session && state === 'loading' && <Loading />}
      {session && state === 'missing' && <Notice tone="warn" text={t('orderNotFound')} />}
      {order && (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <H1 size={wide ? 44 : 32}>AM-{order.number}</H1>
            <Tag label={t(`status_${order.status}` as Key)} tone={TONE[order.status] ?? 'mute'} />
          </View>
          <T size={14} color={colors.muted} style={{ marginBottom: 18 }}>{t('orderedOn')} {date(order.created_at)}</T>

          {reached >= 0 && (
            <Card pad={wide ? 22 : 16} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
                {STEPS.map((s, i) => (
                  <View key={s} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 30, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: i <= reached ? colors.navy : colors.sand }}>
                      {i <= reached ? <Icon name="check" size={16} color={colors.white} /> : <T size={13} w={700} color={colors.muted}>{i + 1}</T>}
                    </View>
                    <T size={12.5} w={i === reached ? 700 : 500} color={i <= reached ? colors.navy : colors.muted} center>{t(`status_${s}` as Key)}</T>
                  </View>
                ))}
              </View>
              {order.tracking_number && (
                <T size={13.5} style={{ marginTop: 14 }} center>{t('tracking')}: {order.shipping_carrier ? `${order.shipping_carrier} · ` : ''}<T w={700} size={13.5}>{order.tracking_number}</T></T>
              )}
            </Card>
          )}

          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: 'flex-start' }}>
            <Card pad={wide ? 22 : 16} style={{ flex: 1, alignSelf: 'stretch', gap: 10 }}>
              <T w={700} size={17} color={colors.navy}>{t('items')}</T>
              {order.order_items.map((it) => (
                <Row key={it.id} label={`${pick(it, 'name')}${it.quantity > 1 ? ` × ${it.quantity}` : ''}`} value={money(it.line_total_minor)} />
              ))}
              <Divider />
              <Row label={t('subtotal')} value={money(order.subtotal_minor)} />
              {order.discount_minor > 0 && <Row label={t('discount')} value={`− ${money(order.discount_minor)}`} />}
              <Row label={t('shipping')} value={money(order.shipping_minor)} />
              <Row label={t('total')} value={money(order.total_minor)} bold />
              <T size={12} color={colors.muted}>{t('vatIncludedAmount')} {money(order.vat_minor)}</T>
              {order.invoices?.[0] && (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <Icon name="shield" size={18} color={colors.success} />
                  <T size={13.5}>{t('invoice')}: <T w={700} size={13.5}>{order.invoices[0].number}</T></T>
                </View>
              )}
            </Card>
            <View style={{ width: wide ? 360 : '100%', gap: 16 }}>
              {order.ship_to && order.ship_to.city !== '-' && (
                <Card pad={20} style={{ gap: 4 }}>
                  <T w={700} size={16} color={colors.navy} style={{ marginBottom: 4 }}>{t('deliveryTo')}</T>
                  <T size={14}>{order.ship_to.recipient_name}</T>
                  {order.ship_to.hotel_name && <T size={14}>{order.ship_to.hotel_name}</T>}
                  {order.ship_to.check_in && <T size={13} color={colors.muted}>{order.ship_to.check_in} → {order.ship_to.check_out}</T>}
                  {order.ship_to.line1 && order.ship_to.line1 !== '-' && <T size={14}>{order.ship_to.line1}</T>}
                  <T size={14}>{order.ship_to.city}, {order.ship_to.country}</T>
                  {order.ship_to.phone && <T size={13} color={colors.muted}>{order.ship_to.phone}</T>}
                </Card>
              )}
              {order.gift_message && (
                <Card pad={20} style={{ gap: 6 }}>
                  <T w={700} size={16} color={colors.navy}>{t('giftMessage')}</T>
                  <T size={14} lh={1.6} style={{ fontStyle: 'italic' }}>“{order.gift_message}”</T>
                </Card>
              )}
              <T size={12.5} color={colors.muted} lh={1.5}>{t('orderHelp')}</T>
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}
