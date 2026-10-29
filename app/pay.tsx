// First payment for a subscription, on Moyasar's payment form. Card details are typed into Moyasar's form and sent
// straight to Moyasar; Al Mukarramah only receives a token for the monthly renewals. Opened in the browser from the apps.
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Seo } from '@/components/seo';
import { Card, H1, Loading, Notice, Row, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { callFunction } from '@/lib/supabase';
import { colors } from '@/theme';

const MPF = 'https://cdn.moyasar.com/mpf/1.15.0';

type FormConfig = {
  publishableKey: string; amount: number; currency: string; description: string; name_en?: string; name_ar?: string;
  metadata: Record<string, string>; callbackUrl: string;
};

declare global {
  interface Window { Moyasar?: { init: (o: unknown) => void } }
}

function loadMoyasar(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Moyasar) return resolve();
    if (!document.querySelector(`link[href="${MPF}/moyasar.css"]`)) {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = `${MPF}/moyasar.css`;
      document.head.appendChild(css);
    }
    const js = document.createElement('script');
    js.src = `${MPF}/moyasar.js`;
    js.onload = () => resolve();
    js.onerror = () => reject(new Error('Moyasar form did not load'));
    document.head.appendChild(js);
  });
}

export default function Pay() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const { order } = useLocalSearchParams<{ order?: string }>();
  const [config, setConfig] = useState<FormConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || !order) return;
    let cancelled = false;
    (async () => {
      try {
        const c = await callFunction<FormConfig>('payment-form', { orderId: order });
        if (cancelled) return;
        setConfig(c);
        await loadMoyasar();
        window.Moyasar!.init({
          element: '.mysr-form',
          amount: c.amount,
          currency: c.currency,
          description: c.description,
          publishable_api_key: c.publishableKey,
          callback_url: c.callbackUrl,
          metadata: c.metadata,
          language: lang,
          methods: ['creditcard'],
          supported_networks: ['mada', 'visa', 'mastercard'],
          credit_card: { save_card: true },
        });
      } catch (e) {
        if (!cancelled) setError(String(e).includes('already_paid') ? t('payAlreadyPaid') : t('payUnavailable'));
      }
    })();
    return () => { cancelled = true; };
  }, [order, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = config ? (lang === 'ar' ? config.name_ar : config.name_en) : '';
  return (
    <Screen chrome="checkout" step={3}>
      <Seo title="Secure payment | Al Mukarramah" description="Secure payment with Moyasar." path="/pay" noindex />
      <H1 size={wide ? 44 : 32}>{t('paymentTitle')}</H1>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 32 : 16, alignItems: 'flex-start' }}>
        <Card pad={wide ? 24 : 16} style={{ flex: 1, alignSelf: 'stretch', borderRadius: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="shield" size={22} color={colors.success} />
            <T size={13.5} lh={1.6} color={colors.body} style={{ flex: 1 }}>{t('payFormNote')}</T>
          </View>
          {error && <Notice tone="warn" text={error} />}
          {!config && !error && <Loading />}
          {/* Moyasar renders its card form into this element (web only). */}
          {Platform.OS === 'web' && React.createElement('div', { className: 'mysr-form', style: { width: '100%', maxWidth: 420 } })}
        </Card>
        {config && (
          <View style={{ width: wide ? 340 : '100%' }}>
            <Card pad={20} style={{ gap: 10, borderRadius: 20 }}>
              <Row label={name ?? ''} value={`${formatMoney(config.amount, config.currency, lang)} / ${t('perMonth')}`} bold />
              <T size={12} color={colors.muted}>{t('vatIncluded')}</T>
              <T size={13} lh={1.5} color={colors.body}>{t('monthlyCharge')}</T>
            </Card>
          </View>
        )}
      </View>
    </Screen>
  );
}
