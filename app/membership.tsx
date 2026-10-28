// Membership — follows MembershipPublic.dc.html. Prices come from the plans table.
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Button, Card, Eyebrow, Notice, Serif, T, useWide } from '@/components/ui';
import { getPlans } from '@/lib/catalogue';
import { strings, useI18n, type Key } from '@/lib/i18n';
import { convertFromSar, formatMoney } from '@/lib/money';
import { buyMembership, purchasesAvailable } from '@/lib/purchases';
import { useSession } from '@/lib/session';
import { callFunction } from '@/lib/supabase';
import type { Plan } from '@/lib/types';
import { colors } from '@/theme';
import { faqLd, Seo } from '@/components/seo';

export default function Membership() {
  const wide = useWide();
  const { t, pick, currency, lang } = useI18n();
  const { session } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [faq, setFaq] = useState<number | null>(0);

  useEffect(() => {
    getPlans().then(setPlans).catch(() => undefined);
  }, []);

  async function join(plan: Plan) {
    if (!session) return setMsg(t('signInToJoin'));
    setBusy(plan.id);
    try {
      // Digital membership inside the iPhone/Android app must use app-store billing.
      if (plan.kind === 'membership' && Platform.OS !== 'web') {
        if (!purchasesAvailable()) return setMsg('App-store billing is available in the store build of the app.');
        await buyMembership();
        return setMsg('✓');
      }
      // Website membership and physical box clubs are paid through Moyasar (card saved for monthly renewal).
      const res = await callFunction<{ paymentUrl: string }>('create-payment', { planId: plan.id, lang });
      if (Platform.OS === 'web') window.location.href = res.paymentUrl;
      else await WebBrowser.openBrowserAsync(res.paymentUrl);
    } catch (e) {
      setMsg(String(e));
    } finally {
      setBusy(null);
    }
  }

  const faqs = [[t('faq1q'), t('faq1a')], [t('faq2q'), t('faq2a')]];

  return (
    <Screen>
      <Seo title="Membership | Al Mukarramah" description="Join for the Quran Trail and Seerah Trail and member benefits on gifts, or receive a box of Madinah dates every month." path="/membership" jsonLd={faqLd([1, 2].map((n) => ({ q: strings.en[`faq${n}q` as Key], a: strings.en[`faq${n}a` as Key] })))} />
      <View style={{ alignItems: 'center', maxWidth: 760, alignSelf: 'center', gap: 10, marginBottom: 28, marginTop: wide ? 16 : 0 }}>
        <Eyebrow size={12}>{t('membership')}</Eyebrow>
        <Serif role="h1" size={wide ? 56 : 36} center>{t('memberTitle')}</Serif>
        <T size={wide ? 17 : 15} lh={1.6} color={colors.body} center>{t('memberBody')}</T>
      </View>
      {msg && <Notice text={msg} />}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 18, maxWidth: 980, width: '100%', alignSelf: 'center' }}>
        {plans.map((p) => {
          const featured = p.kind === 'membership';
          return (
            <View key={p.id} style={{ flex: 1, backgroundColor: featured ? colors.navy : colors.white, borderWidth: 1, borderColor: featured ? colors.navy : colors.line, borderRadius: 24, padding: wide ? 28 : 20, gap: 12 }}>
              <Eyebrow size={11} color={featured ? colors.champagne : colors.brassText}>{t(p.kind === 'membership' ? 'kind_membership' : 'kind_box')}</Eyebrow>
              <Serif size={wide ? 38 : 30} color={featured ? colors.white : colors.navy}>{pick(p, 'name')}</Serif>
              <T size={15} lh={1.6} color={featured ? '#D6D8EA' : colors.body}>{pick(p, 'description')}</T>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <T w={700} size={28} color={featured ? colors.white : colors.navy}>{formatMoney(convertFromSar(p.price_sar, currency), currency, lang)}</T>
                <T size={14} color={featured ? '#D6D8EA' : colors.muted}>{t(p.period === 'year' ? 'perYear' : 'perMonth')}</T>
              </View>
              <T size={12} color={featured ? '#B9BCD6' : colors.muted}>{t('vatIncluded')}</T>
              <Button label={t('join')} kind={featured ? 'light' : 'primary'} busy={busy === p.id} onPress={() => join(p)} style={{ marginTop: 'auto', alignSelf: 'flex-start' }} />
            </View>
          );
        })}
      </View>

      <Card pad={wide ? 24 : 16} style={{ marginTop: 32, maxWidth: 980, width: '100%', alignSelf: 'center', borderRadius: 20 }}>
        {faqs.map(([q, a], i) => (
          <View key={q} style={{ borderTopWidth: i ? 1 : 0, borderColor: colors.line }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: faq === i }} onPress={() => setFaq(faq === i ? null : i)}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 52, gap: 12 }}>
              <T w={700} style={{ flex: 1 }}>{q}</T>
              <Icon name={faq === i ? 'minus' : 'plus'} size={18} />
            </Pressable>
            {faq === i && <T size={14} lh={1.7} color={colors.body} style={{ paddingBottom: 14 }}>{a}</T>}
          </View>
        ))}
      </Card>
    </Screen>
  );
}
