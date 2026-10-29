// Subscribe to a box club (e.g. the Dates Club): delivery address, then Moyasar's secure page.
// The card is saved by Moyasar (never by us) so the box can be charged monthly; cancel any time from the account page.
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Seo } from '@/components/seo';
import { Button, Card, Field, H1, Notice, Row, T, useWide } from '@/components/ui';
import { getPlans } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { callFunction } from '@/lib/supabase';
import type { Plan } from '@/lib/types';
import { colors } from '@/theme';

export default function Subscribe() {
  const wide = useWide();
  const { t, pick, lang } = useI18n();
  const { session } = useSession();
  const { plan: slug } = useLocalSearchParams<{ plan?: string }>();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [line1, setLine1] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlans().then((ps) => setPlan(ps.find((p) => p.slug === slug) ?? null)).catch(() => undefined);
  }, [slug]);

  const ready = !!session && !!plan && !!name.trim() && !!phone.trim() && !!city.trim() && !!line1.trim();

  async function pay() {
    if (!plan) return;
    setBusy(true);
    setError(null);
    try {
      const res = await callFunction<{ paymentUrl: string }>('create-payment', {
        planId: plan.id, lang,
        shipTo: { kind: 'home', recipient_name: name.trim(), phone: phone.trim(), country: 'SA', city: city.trim(), line1: line1.trim() },
      });
      if (Platform.OS === 'web') window.location.href = res.paymentUrl;
      else await WebBrowser.openBrowserAsync(res.paymentUrl);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen chrome="checkout" step={2}>
      <Seo title="Join | Al Mukarramah" description="Subscribe to an Al Mukarramah box." path="/subscribe" noindex />
      <H1 size={wide ? 44 : 32}>{plan ? pick(plan, 'name') : t('subscribeTitle')}</H1>
      {!session && <Notice text={t('signInToJoin')} />}
      {!session && <Button label={t('signIn')} href="/account" style={{ alignSelf: 'flex-start', marginTop: 10 }} />}
      {session && (
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 32 : 16, alignItems: 'flex-start', marginTop: 8 }}>
          <Card pad={wide ? 24 : 16} style={{ flex: 1, alignSelf: 'stretch', borderRadius: 20, gap: 4 }}>
            <T w={700} size={17} color={colors.navy}>{t('boxDeliverTo')}</T>
            <T size={13} color={colors.muted} style={{ marginBottom: 8 }}>{t('boxSaudiOnly')}</T>
            <Field label={t('recipientName')} value={name} onChangeText={setName} autoComplete="name" />
            <Field label={t('phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" dirLtr />
            <Field label={t('city')} value={city} onChangeText={setCity} />
            <Field label={t('address')} value={line1} onChangeText={setLine1} autoComplete="street-address" />
          </Card>
          <View style={{ width: wide ? 360 : '100%' }}>
            <Card pad={20} style={{ gap: 10, borderRadius: 20 }}>
              {plan && <Row label={pick(plan, 'name')} value={`${formatMoney(plan.price_sar, 'SAR', lang)} / ${t('perMonth')}`} bold />}
              <T size={12} color={colors.muted}>{t('vatIncluded')}</T>
              <T size={13} lh={1.5} color={colors.body}>{t('monthlyCharge')}</T>
              {error && <Notice tone="warn" text={error} />}
              <Button size="lg" label={t('startSubscription')} onPress={pay} busy={busy} disabled={!ready} style={{ marginTop: 6 }}
                icon={<Icon name="lock" size={18} color={ready ? colors.white : colors.muted} />} />
            </Card>
          </View>
        </View>
      )}
    </Screen>
  );
}
