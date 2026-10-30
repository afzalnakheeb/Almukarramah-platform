// Delivery and payment — follows HotelDelivery / Checkout.dc.html (steps 2–3).
// Card details are never collected here: payment happens on Moyasar's hosted page.
import * as WebBrowser from 'expo-web-browser';
import { Link, router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Button, Card, Divider, Field, H1, Notice, OptionCard, Row, Serif, T, useHydrated, useWide } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { MARKET_DEMO, MARKET_LIVE } from '@/lib/flags';
import { getSettings } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import { convertFromSar, formatMoney } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';
import { useSession } from '@/lib/session';
import { callFunction } from '@/lib/supabase';
import type { CartLine, ShippingQuote, ShipTo } from '@/lib/types';
import { colors } from '@/theme';
import { Seo } from '@/components/seo';
import { AskAssistant } from '@/components/assistant';
import { useAssistantFill } from '@/lib/assistant';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type Parcel = { name: { en: string; ar: string }; amountSar: number; free?: boolean; daysMin?: number; daysMax?: number; handlingDays: number; productionDays?: number; dutiesMode?: string; dutiesSar?: number };
const newKey = () => `co_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;

// The screenshot build only (EXPO_PUBLIC_MARKET_DEMO=1, /checkout?demo=ddp): a Saudi seller's parcel to Dubai with
// import duties paid at checkout (DDP), as the rulebook plans it. Nothing here is real and nothing can be paid.
const DEMO_LINES: CartLine[] = [
  { productId: 'demo-live', slug: 'ameer-al-oud-6ml', key: 'd1', name_en: 'Ameer al oud, aged oud oil, 6 ml', name_ar: 'أمير العود، دهن عود معتّق ٦ مل', unitPriceSar: 98000, quantity: 1, sellerName: 'Dar Al Oud Madinah' },
  { productId: 'demo-burner', slug: 'crystal-bakhoor-burner', key: 'd2', name_en: 'Crystal bakhoor burner, hand-cut', name_ar: 'مبخرة كريستال مقطوعة يدويًا', unitPriceSar: 49000, quantity: 1, sellerName: 'Dar Al Oud Madinah' },
];
const DEMO_SHIP: ShipTo = { kind: 'home', recipient_name: 'Maryam Al Harbi', phone: '+971 50 000 0000', country: 'AE', city: 'Dubai', line1: 'Al Wasl Road, Villa 12' };
const DEMO_PARCELS: Parcel[] = [{ name: { en: 'Dar Al Oud Madinah', ar: 'دار العود المدينة' }, amountSar: 4500, daysMin: 3, daysMax: 6, handlingDays: 2, dutiesMode: 'ddp', dutiesSar: 2450 }];

export default function Checkout() {
  const wide = useWide();
  const { t, pick, currency, lang } = useI18n();
  const { session } = useSession();
  const { destination } = usePrefs();
  const cart = useCart();
  const { clear, giftMessage, setQty } = cart;
  const hydrated = useHydrated();
  const params = useLocalSearchParams<{ demo?: string }>();
  const demo = hydrated && MARKET_DEMO && params.demo === 'ddp';
  const lines = demo ? DEMO_LINES : cart.lines;
  const subtotalSar = demo ? DEMO_LINES.reduce((n, l) => n + l.unitPriceSar * l.quantity, 0) : cart.subtotalSar;
  const initial = useMemo<ShipTo>(() => {
    if (destination === 'madinah-hotel') return { kind: 'hotel', recipient_name: '', phone: '', country: 'SA', city: 'Madinah', line1: '' };
    if (destination === 'makkah-hotel') return { kind: 'hotel', recipient_name: '', phone: '', country: 'SA', city: 'Makkah', line1: '' };
    if (destination === 'international') return { kind: 'home', recipient_name: '', phone: '', country: '', city: '', line1: '' };
    return { kind: 'home', recipient_name: '', phone: '', country: 'SA', city: '', line1: '' };
  }, [destination]);
  const [shipTo, setShipTo] = useState<ShipTo>(initial);
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [emailTouched, setEmailTouched] = useState(false);
  const [partner, setPartner] = useState('');
  const [quotes, setQuotes] = useState<ShippingQuote[] | null>(null);
  const [chosen, setChosen] = useState<ShippingQuote | null>(null);
  const [sellerShip, setSellerShip] = useState<Parcel[]>([]);
  const [blocked, setBlocked] = useState<{ index: number; en: string; ar: string }[]>([]);
  const [houseDap, setHouseDap] = useState(false);
  // one key per checkout: pressing Pay twice (or a retried request) never creates a second order
  const idem = useRef(newKey());
  const [needsZone, setNeedsZone] = useState(true);
  const [busy, setBusy] = useState<'rates' | 'pay' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(true);

  useEffect(() => setShipTo(initial), [initial]);
  useEffect(() => {
    if (!demo) return;
    setShipTo(DEMO_SHIP); setEmail('maryam@example.com'); setQuotes([]); setNeedsZone(false); setSellerShip(DEMO_PARCELS); setBlocked([]);
  }, [demo]);
  // The assistant can fill in the delivery form from what the shopper types; nothing is sent until they press Pay.
  useAssistantFill((f) => {
    setShipTo((s) => ({ ...s, ...f, country: (f.country ?? s.country).toUpperCase().slice(0, 2) }));
    setQuotes(null);
    setChosen(null);
  });
  useEffect(() => {
    if (session?.user.email) setEmail((e) => e || session.user.email!);
  }, [session?.user.email]);
  useEffect(() => {
    getSettings().then((s) => s && setCheckoutOpen(s.checkout_open)).catch(() => undefined);
  }, []);

  const set = (k: keyof ShipTo) => (v: string) => {
    setShipTo((s) => ({ ...s, [k]: v }));
    setQuotes(null);
    setChosen(null);
    idem.current = newKey();
  };
  useEffect(() => { if (demo) return; setQuotes(null); setChosen(null); setBlocked([]); idem.current = newKey(); }, [lines.length]);
  const money = (sar: number) => formatMoney(convertFromSar(sar, currency), currency, lang);
  const items = lines.map((l) => ({ productId: l.productId, variantId: l.variantId ?? null, quantity: l.quantity, custom: l.custom }));
  const emailOk = EMAIL.test(email.trim());
  const ready = emailOk && !!shipTo.recipient_name && !!shipTo.phone && !!shipTo.city && shipTo.country.length === 2 && (shipTo.kind === 'hotel' ? !!shipTo.hotel_name : !!shipTo.line1);

  async function getRates() {
    setError(null);
    setBusy('rates');
    try {
      if (MARKET_LIVE) {
        // the rulebook decides each line: what can come here, each seller's parcel, duties, our own delivery zones
        const res = await callFunction<{ zones: ShippingQuote[]; needsZone: boolean; reason: string | null; parcels: Parcel[]; blocked: { index: number; en: string; ar: string }[]; house: { dutiesMode: string } | null }>('shipping-quote', { shipTo, items });
        setQuotes(res.zones);
        setChosen(res.zones[0] ?? null);
        setSellerShip(res.parcels);
        setBlocked(res.blocked);
        setHouseDap(res.house?.dutiesMode === 'dap');
        setNeedsZone(res.needsZone);
        if (res.needsZone && !res.zones.length) setError(t(res.reason === 'perfume_spray' ? 'noDeliveryPerfume' : 'noDeliveryHere'));
        return;
      }
      const res = await callFunction<{ quotes: ShippingQuote[]; needsZone?: boolean; sellerShipping?: { name: string; amountSar: number; handlingDays: number }[]; reason?: string | null }>('shipping-rates', { shipTo, items });
      setQuotes(res.quotes);
      setChosen(res.quotes[0] ?? null);
      setSellerShip((res.sellerShipping ?? []).map((x) => ({ ...x, name: { en: x.name, ar: x.name } })));
      setNeedsZone(res.needsZone !== false);
      if (res.needsZone !== false && !res.quotes.length) setError(t(res.reason === 'perfume_spray' ? 'noDeliveryPerfume' : 'noDeliveryHere'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const ratesReady = !!quotes && (needsZone ? !!chosen : true) && !blocked.length;
  async function pay() {
    if (!ratesReady) return;
    if (demo) { setError(t('lfDemo')); return; }
    setError(null);
    setBusy('pay');
    try {
      const res = await callFunction<{ paymentUrl: string; orderId: string }>('create-payment', {
        items, shipTo, email: email.trim(), currency, zoneId: chosen?.zoneId, giftMessage: giftMessage || null, partnerCode: partner || null, lang, idempotencyKey: idem.current,
      });
      if (Platform.OS === 'web') {
        window.location.href = res.paymentUrl;
      } else {
        await WebBrowser.openBrowserAsync(res.paymentUrl);
        clear();
        router.replace('/account');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (lines.length === 0) {
    return (
      <Screen chrome="checkout" step={2}>
      <Seo title="Checkout | Al Mukarramah" description="Delivery and secure payment." path="/checkout" noindex />
        <Notice text={t('bagEmpty')} />
        <Button label={t('exploreGifts')} href="/shop" style={{ alignSelf: 'flex-start' }} />
      </Screen>
    );
  }

  const sellerShipSar = sellerShip.reduce((s, x) => s + x.amountSar, 0);
  const shippingSar = (needsZone ? chosen?.amountSar ?? 0 : 0) + sellerShipSar;
  const dutiesSar = sellerShip.reduce((s, x) => s + (x.dutiesMode === 'ddp' ? x.dutiesSar ?? 0 : 0), 0);
  const total = subtotalSar + shippingSar + dutiesSar;
  const dap = houseDap || sellerShip.some((x) => x.dutiesMode === 'dap');
  const section = (title: string, children: React.ReactNode, right?: React.ReactNode) => (
    <Card pad={wide ? 24 : 16} style={{ borderRadius: 6, gap: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <Serif role="h2" size={wide ? 28 : 24}>{title}</Serif>
        {right}
      </View>
      {children}
    </Card>
  );
  const two = { flexDirection: wide ? ('row' as const) : ('column' as const), gap: wide ? 14 : 0 };

  return (
    <Screen chrome="checkout" step={quotes ? 3 : 2}>
      <Seo title="Checkout | Al Mukarramah" description="Delivery and secure payment." path="/checkout" noindex />
      <H1 size={wide ? 48 : 34}>{t('checkoutTitle')}</H1>
      {!session && (
        <T color={colors.muted} style={{ marginBottom: 18 }}>
          {t('noAccountNeeded')} <Link href="/account"><T w={700} color={colors.navy} style={{ textDecorationLine: 'underline' }}>{t('signIn')}</T></Link>
        </T>
      )}
      {!checkoutOpen && <Notice tone="warn" text={t('checkoutClosed')} />}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 32 : 16, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, alignSelf: 'stretch', gap: 16 }}>
          {section(t('contactTitle'), (
            <Field label={t('emailReceipt')} value={email} onChangeText={setEmail} onBlur={() => setEmailTouched(true)} keyboardType="email-address" autoCapitalize="none" autoComplete="email" dirLtr
              error={emailTouched && !emailOk ? t('emailInvalid') : null} />
          ))}

          {section(t('whereTitle'), (
            <>
              <AskAssistant label={t('fillWithAssistant')} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {(['hotel', 'home', 'office'] as const).map((k) => (
                  <OptionCard key={k} selected={shipTo.kind === k} onPress={() => set('kind')(k)} title={t(k === 'home' ? 'home_' : k)}
                    icon={<Icon name={k === 'hotel' ? 'bed' : 'house'} size={22} stroke={1.6} />} />
                ))}
              </View>
              <View style={two}>
                <Field label={t('recipientName')} value={shipTo.recipient_name} onChangeText={set('recipient_name')} autoComplete="name" />
                <Field label={t('phone')} value={shipTo.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" dirLtr />
              </View>
              {shipTo.kind === 'hotel' && (
                <>
                  <Field label={t('hotelName')} value={shipTo.hotel_name ?? ''} onChangeText={set('hotel_name')} />
                  <View style={two}>
                    <Field label={t('checkIn')} value={shipTo.check_in ?? ''} onChangeText={set('check_in')} dirLtr />
                    <Field label={t('checkOut')} value={shipTo.check_out ?? ''} onChangeText={set('check_out')} dirLtr />
                  </View>
                </>
              )}
              <View style={two}>
                <Field label={t('city')} value={shipTo.city} onChangeText={set('city')} />
                <Field label={t('country')} value={shipTo.country} onChangeText={(v) => set('country')(v.toUpperCase().slice(0, 2))} autoCapitalize="characters" dirLtr />
              </View>
              {shipTo.kind !== 'hotel' && <Field label={t('address')} value={shipTo.line1} onChangeText={set('line1')} autoComplete="street-address" />}
              <Field label={t('partnerCode')} value={partner} onChangeText={setPartner} autoCapitalize="characters" dirLtr />
              {!quotes && <Button label={t('getRates')} kind="secondary" onPress={getRates} busy={busy === 'rates'} disabled={!ready} style={{ alignSelf: wide ? 'flex-start' : 'stretch' }} />}
              {!ready && !quotes && <T size={13} color={colors.muted}>{t('fillToSeeRates')}</T>}
            </>
          ))}

          {quotes && section(t('deliveryOptions'), (
            <View style={{ gap: 10 }}>
              {needsZone && quotes.map((q) => (
                <OptionCard key={q.zoneId} selected={chosen?.zoneId === q.zoneId} onPress={() => setChosen(q)} title={`${q.carrier} · ${q.service}`}
                  body={`${money(q.amountSar)} · ${q.daysMin}–${q.daysMax} ${t('days')}`} />
              ))}
              {blocked.length ? (
                <View style={{ gap: 8, borderWidth: 1, borderColor: colors.danger, padding: 14, backgroundColor: colors.dangerBg }}>
                  <T w={700} size={14.5} color={colors.danger}>{t('coBlockedTitle')}</T>
                  {blocked.map((b) => (
                    <View key={b.index} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <T size={13.5} style={{ flex: 1 }}>{lang === 'ar' ? b.ar : b.en}</T>
                      {lines[b.index] ? <Button label={t('remove')} kind="text" size="sm" onPress={() => setQty(lines[b.index].key ?? lines[b.index].productId, 0)} /> : null}
                    </View>
                  ))}
                </View>
              ) : null}
              {sellerShip.map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14 }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T w={700} size={14.5} color={colors.navy}>{t('shippedBy')} {lang === 'ar' ? s.name.ar : s.name.en}</T>
                    {s.productionDays ? <T size={13} color={colors.brassText}>{t('coMadeFirst').replace('{n}', String(s.productionDays))}</T> : null}
                    <T size={13} color={colors.muted}>{s.daysMin && s.daysMax ? `${t('coArrives').replace('{a}', String(s.daysMin)).replace('{b}', String(s.daysMax))} · ` : `${t('dispatchWithin')} ${s.handlingDays} ${t('businessDays')} · `}{t('withTracking')}</T>
                    {s.dutiesMode === 'ddp' && s.dutiesSar ? <T size={13} color={colors.body}>{t('coDutiesPaid')} {money(s.dutiesSar)}</T> : null}
                  </View>
                  <T w={700} size={14.5}>{s.amountSar ? money(s.amountSar) : t('free')}</T>
                </View>
              ))}
              {dap ? <Notice text={t('coDutiesOnDelivery')} /> : null}
            </View>
          ))}

          {section(t('giftTitle'), (
            <T size={14} color={colors.body} lh={1.6}>{giftMessage ? `“${giftMessage}”` : t('noGiftMessage')}</T>
          ), <Link href="/cart"><T w={700} size={14} color={colors.navy} style={{ textDecorationLine: 'underline' }}>{t('edit')}</T></Link>)}

          {section(t('paymentTitle'), (
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Icon name="shield" size={24} color={colors.success} />
              <View style={{ flex: 1, gap: 4 }}>
                <T size={14} lh={1.6} color={colors.body}>{t('paymentBody')}</T>
                <T w={700} size={13} color={colors.navy}>{t('payNote')}</T>
              </View>
            </View>
          ))}
        </View>

        <View style={{ width: wide ? 380 : '100%' }}>
          <Card pad={20} style={{ gap: 10, borderRadius: 6 }}>
            <T w={700} size={17} color={colors.navy}>{t('yourOrder')}</T>
            {lines.map((l) => <Row key={l.key ?? l.productId} label={`${pick(l, 'name')}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`} value={money(l.unitPriceSar * l.quantity)} />)}
            <Row label={t('shipping')} value={ratesReady ? money(shippingSar) : t('deliveryNext')} color={ratesReady ? undefined : colors.muted} />
            {dutiesSar ? <Row label={t('coDuties')} value={money(dutiesSar)} /> : null}
            <Divider />
            <Row label={t('total')} value={money(total)} bold />
            <T size={12} color={colors.muted}>{t('vatIncluded')}</T>
            {error && <Notice tone="warn" text={error} />}
            <Button size="lg" label={ratesReady ? `${t('payPrefix')} ${money(total)}` : t('pay')} onPress={pay} busy={busy === 'pay'} disabled={!ratesReady || !checkoutOpen} style={{ marginTop: 6 }}
              icon={<Icon name="lock" size={18} color={ratesReady && checkoutOpen ? colors.white : colors.muted} />} />
          </Card>
        </View>
      </View>
    </Screen>
  );
}
