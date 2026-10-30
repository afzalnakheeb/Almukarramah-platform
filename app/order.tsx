// One order in the account: items, totals, delivery, tracking and tax invoice; for each parcel, returns (ask, follow,
// take to our team), a conversation with the seller and reviews of what arrived. Only the shopper (or staff) can read it.
import { Link, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { ReturnCard, ReturnForm } from '@/components/aftersale';
import { Screen } from '@/components/chrome';
import { StartConversation } from '@/components/conversation';
import { Icon } from '@/components/icons';
import { Seo } from '@/components/seo';
import { Button, Card, Divider, H1, Loading, Notice, Row, T, Tag, useHydrated, useWide } from '@/components/ui';
import { MARKET_DEMO } from '@/lib/flags';
import { useI18n, type Key } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { orderTracking, type OrderTracking, type ParcelTracking } from '@/lib/orders';
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
  const [parcels, setParcels] = useState<OrderTracking | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  // the example order exists only in the screenshot build, and only once the page is live (the page is pre-rendered without it)
  const hydrated = useHydrated();
  const demo = hydrated && MARKET_DEMO && id === 'demo-order';
  const reloadParcels = () => { if ((session || demo) && id) orderTracking(id).then(setParcels).catch(() => undefined); };
  useEffect(reloadParcels, [session, id, demo]);

  useEffect(() => {
    if (demo) { setOrder(DEMO_ORDER); setState('ready'); return; }
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
  }, [session, id, demo]);

  const money = (m: number) => formatMoney(m, order?.currency ?? 'SAR', lang);
  const date = (s: string) => new Date(s).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const reached = order ? STEPS.indexOf(order.status as (typeof STEPS)[number]) : -1;

  return (
    <Screen>
      <Seo title="Order | Al Mukarramah" description="Your order." path="/order" noindex />
      <Button kind="text" size="sm" label={t('backToAccount')} href="/account" style={{ alignSelf: 'flex-start', marginBottom: 6 }} />
      {!session && !demo && <Notice text={t('signInToSeeOrder')} />}
      {session && state === 'loading' && <Loading />}
      {session && state === 'missing' && <Notice tone="warn" text={t('orderNotFound')} />}
      {demo ? <Notice text={t('lfDemo')} /> : null}
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

          {parcels && parcels.sub_orders.length === 1 && parcels.sub_orders[0].kind === 'house' ? (
            // one parcel of our own: the steps above show it; returns and messages are here
            <Card pad={wide ? 20 : 14} style={{ marginBottom: 16 }}>
              <AfterSale p={parcels.sub_orders[0]} asking={asking === parcels.sub_orders[0].id} onAsk={() => setAsking(parcels.sub_orders[0].id)}
                onClose={() => setAsking(null)} onDone={() => { setAsking(null); reloadParcels(); }} />
            </Card>
          ) : null}

          {parcels && parcels.sub_orders.length > 1 || parcels?.sub_orders.some((p) => p.kind !== 'house') ? (
            <View style={{ gap: 12, marginBottom: 16 }}>
              <T w={700} size={17} color={colors.navy}>{t('trParcels')}</T>
              {parcels!.sub_orders.map((p) => (
                <Card key={p.id} pad={wide ? 20 : 14} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                    <T w={700} size={15} color={colors.navy}>{p.seller ? (lang === 'ar' ? p.seller.name_ar : p.seller.name_en) : t('srHouse')}</T>
                    <Tag label={t(`tr_${p.status}` as Key)} tone={p.status === 'delivered' ? 'ok' : p.status === 'cancelled' || p.status === 'delivery_failed' ? 'err' : 'info'} />
                  </View>
                  <T size={12.5} color={colors.muted} num>{p.number}</T>
                  {p.lines.map((l, i) => (
                    <View key={i} style={{ gap: 2 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <T size={13.5} style={{ flex: 1 }}>{l.quantity} × {pick(l, 'name')}{l.variant ? ` · ${l.variant}` : ''}</T>
                        <T size={12.5} color={colors.muted}>{l.return_policy ? t(`trReturn_${l.return_policy}` as Key).replace('{n}', String(l.return_window_days ?? 0)) : ''}</T>
                      </View>
                      {p.status === 'delivered' && l.product_id ? (
                        l.review ? <T size={12.5} color={colors.muted}>{t('rvYours')}: {'★'.repeat(l.review.rating)} · {t(`rvStatus_${l.review.status}` as Key)}</T>
                          : <Link href={{ pathname: '/review', params: { item: l.id } }}><T size={12.5} w={600} color={colors.emerald}>{t('rvWrite')}</T></Link>
                      ) : null}
                      {l.refunded_quantity ? <T size={12.5} color={colors.emerald}>{t('rtRefundedQty').replace('{n}', String(l.refunded_quantity))}</T> : null}
                    </View>
                  ))}
                  {p.production_days && ['awaiting_acceptance', 'accepted', 'in_production'].includes(p.status) ? <T size={13} color={colors.brassText}>{t('trMaking').replace('{n}', String(p.production_days))}</T> : null}
                  {p.expected_from && p.expected_to && !['delivered', 'cancelled'].includes(p.status) ? (
                    <T size={13} color={colors.body}>{t('trExpected')} {date(p.expected_from)} – {date(p.expected_to)}</T>
                  ) : null}
                  {p.cancel_reason ? <Notice tone="warn" text={`${t('trCancelled')} ${p.cancel_reason}`} /> : null}
                  {p.shipments[0] ? (
                    <View style={{ gap: 4, borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 8 }}>
                      <T size={13} num>{t('tracking')}: {p.shipments[0].carrier ? `${p.shipments[0].carrier} · ` : ''}<T w={700} size={13}>{p.shipments[0].tracking_number}</T></T>
                      {p.shipments[0].events.slice(0, 5).map((e, i) => (
                        <T key={i} size={12.5} color={i ? colors.muted : colors.body}>{date(e.at)} · {(lang === 'ar' ? e.ar : e.en) ?? e.status}{e.location ? ` · ${e.location}` : ''}</T>
                      ))}
                    </View>
                  ) : null}
                  <AfterSale p={p} asking={asking === p.id} onAsk={() => setAsking(p.id)} onClose={() => setAsking(null)} onDone={() => { setAsking(null); reloadParcels(); }} />
                </Card>
              ))}
            </View>
          ) : null}

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
              {parcels?.refunds.filter((f) => f.status === 'succeeded').map((f, i) => (
                <T key={i} size={13} color={colors.emerald}>{t('rtRefundLine').replace('{amount}', money(f.amount_minor)).replace('{date}', date(f.completed_at ?? f.created_at))}{f.credit_note ? ` · ${f.credit_note}` : ''}</T>
              ))}
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

// Returns, the conversation with the seller and the button to ask, under each parcel.
function AfterSale({ p, asking, onAsk, onClose, onDone }: { p: ParcelTracking; asking: boolean; onAsk: () => void; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const canAsk = (p.status === 'delivered' && !!p.problem_until && p.problem_until >= today) || (!!p.not_received_from && today >= p.not_received_from);
  return (
    <View style={{ gap: 10 }}>
      {p.returns.map((r) => (
        <ReturnCard key={r.id} r={r} side="customer" onDone={onDone} messagesHref={r.thread_id ? { pathname: '/messages', params: { thread: r.thread_id } } : undefined} />
      ))}
      {asking ? <ReturnForm parcel={p} onDone={onDone} onCancel={onClose} /> : (
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {canAsk ? <Button size="sm" kind="secondary" label={t('rtAsk')} onPress={onAsk} /> : null}
          {p.thread_id ? <Button size="sm" kind="text" label={p.seller ? t('msOpenWithSeller') : t('msOpenWithUs')} href={{ pathname: '/messages', params: { thread: p.thread_id } }} />
            : <StartConversation as="customer" subOrderId={p.id} label={p.seller ? t('msAskSeller') : t('msAskUs')} onSent={(id) => router.push({ pathname: '/messages', params: { thread: id } })} />}
        </View>
      )}
    </View>
  );
}

// The example order in the screenshot build (EXPO_PUBLIC_MARKET_DEMO=1) only.
const DEMO_ORDER: Order = {
  id: 'demo-order', number: 104960, status: 'delivered', currency: 'SAR', kind: 'shop', created_at: '2026-10-27T09:58:00Z', paid_at: '2026-10-27T10:00:00Z',
  subtotal_minor: 104000, shipping_minor: 5500, discount_minor: 0, total_minor: 109500, vat_minor: 14283,
  ship_to: { recipient_name: 'Yusuf', city: 'Dammam', country: 'SA', line1: '—' }, gift_message: null, shipping_carrier: null, tracking_number: null,
  order_items: [
    { id: 'i1', name_en: 'Ameer al oud, aged oud oil, 6 ml', name_ar: 'أمير العود، دهن عود معتّق ٦ مل', quantity: 1, unit_price_minor: 98000, line_total_minor: 98000 },
    { id: 'i6', name_en: 'Ajwa dates, 1 kg', name_ar: 'تمر عجوة، ١ كغ', quantity: 1, unit_price_minor: 6000, line_total_minor: 6000 },
  ],
  invoices: [{ id: 'inv', number: 'INV-2026-000412', created_at: '2026-10-27T10:00:00Z' }],
};
