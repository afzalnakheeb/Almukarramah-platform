import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Button, Chip, Field, H1, Notice, Screen, Section } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { useI18n } from '@/lib/i18n';
import { convertFromSar, formatMoney } from '@/lib/money';
import { callFunction } from '@/lib/supabase';
import type { ShippingQuote, ShipTo } from '@/lib/types';
import { colors, radius, space, type } from '@/theme';

export default function Checkout() {
  const { t, currency, lang } = useI18n();
  const { lines, subtotalSar, clear } = useCart();
  const [shipTo, setShipTo] = useState<ShipTo>({ kind: 'home', recipient_name: '', phone: '', country: 'SA', city: '', line1: '' });
  const [email, setEmail] = useState('');
  const [gift, setGift] = useState('');
  const [partner, setPartner] = useState('');
  const [quotes, setQuotes] = useState<ShippingQuote[] | null>(null);
  const [chosen, setChosen] = useState<ShippingQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof ShipTo) => (v: string) => setShipTo((s) => ({ ...s, [k]: v }));
  const money = (sar: number) => formatMoney(convertFromSar(sar, currency), currency, lang);
  const items = lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));

  async function getRates() {
    setError(null);
    setBusy(true);
    try {
      const res = await callFunction<{ quotes: ShippingQuote[] }>('shipping-rates', { shipTo, items });
      setQuotes(res.quotes);
      setChosen(res.quotes[0] ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function pay() {
    if (!chosen) return;
    setError(null);
    setBusy(true);
    try {
      const res = await callFunction<{ paymentUrl: string; orderId: string }>('create-payment', {
        items, shipTo, email, currency, zoneId: chosen.zoneId, giftMessage: gift || null, partnerCode: partner || null, lang,
      });
      if (Platform.OS === 'web') {
        window.location.href = res.paymentUrl;
      } else {
        await WebBrowser.openBrowserAsync(res.paymentUrl);
        clear();
        router.replace('/account');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (lines.length === 0) return <Screen><Notice text={t('bagEmpty')} /></Screen>;

  return (
    <Screen>
      <H1>{t('checkout')}</H1>
      <Section title={t('deliverTo')}>
        <View style={{ flexDirection: 'row', gap: space(1), marginBottom: space(2) }}>
          {(['home', 'hotel', 'office'] as const).map((k) => (
            <Chip key={k} label={t(k === 'home' ? 'home_' : k)} active={shipTo.kind === k} onPress={() => setShipTo((s) => ({ ...s, kind: k }))} />
          ))}
        </View>
        <Field label={t('email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Field label={t('recipientName')} value={shipTo.recipient_name} onChangeText={set('recipient_name')} />
        <Field label={t('phone')} value={shipTo.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <Field label={t('country')} value={shipTo.country} onChangeText={(v) => set('country')(v.toUpperCase().slice(0, 2))} autoCapitalize="characters" />
        <Field label={t('city')} value={shipTo.city} onChangeText={set('city')} />
        {shipTo.kind === 'hotel' && (
          <>
            <Field label={t('hotelName')} value={shipTo.hotel_name ?? ''} onChangeText={set('hotel_name')} />
            <Field label={t('checkIn')} value={shipTo.check_in ?? ''} onChangeText={set('check_in')} />
            <Field label={t('checkOut')} value={shipTo.check_out ?? ''} onChangeText={set('check_out')} />
          </>
        )}
        <Field label={t('address')} value={shipTo.line1} onChangeText={set('line1')} />
        <Field label={t('giftMessage')} value={gift} onChangeText={setGift} multiline />
        <Field label={t('partnerCode')} value={partner} onChangeText={setPartner} autoCapitalize="characters" />
        <Button label={t('getRates')} kind="secondary" onPress={getRates} busy={busy && !quotes} disabled={!shipTo.city || !shipTo.recipient_name || !email} />
      </Section>

      {quotes && (
        <Section title={t('shipping')}>
          {quotes.map((q) => (
            <Pressable key={q.zoneId} onPress={() => setChosen(q)} style={{ borderWidth: chosen?.zoneId === q.zoneId ? 2 : 1, borderColor: chosen?.zoneId === q.zoneId ? colors.navy : colors.line, backgroundColor: colors.white, borderRadius: radius.md, padding: space(2), marginBottom: space(1) }}>
              <Text style={[type.body, { fontWeight: '600' }]}>{q.carrier} · {q.service}</Text>
              <Text style={type.small}>{money(q.amountSar)} · {q.daysMin}–{q.daysMax} {t('days')}</Text>
            </Pressable>
          ))}
        </Section>
      )}

      <View style={{ marginTop: space(3) }}>
        <Row label={t('subtotal')} value={money(subtotalSar)} />
        <Row label={t('shipping')} value={chosen ? money(chosen.amountSar) : '—'} />
        <Row label={t('total')} value={money(subtotalSar + (chosen?.amountSar ?? 0))} bold />
        <Text style={type.small}>{t('vatIncluded')}</Text>
      </View>

      {error && <Notice tone="warn" text={error} />}
      <Button label={t('pay')} onPress={pay} busy={busy && !!quotes} disabled={!chosen} style={{ marginTop: space(3) }} />
      <Text style={[type.small, { marginTop: space(1) }]}>{t('payNote')}</Text>
    </Screen>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
      <Text style={[type.body, bold && { fontWeight: '700' }]}>{label}</Text>
      <Text style={[type.body, bold && { fontWeight: '700' }]}>{value}</Text>
    </View>
  );
}
