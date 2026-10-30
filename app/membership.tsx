// Membership: a centred head, plans on porcelain (the membership double-ruled in gold), answers between hairlines.
// Prices come from the plans table.
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { DoubleFrame, Ornament } from '@/components/decor';
import { Button, Eyebrow, Notice, Serif, T, useWide } from '@/components/ui';
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
      // Box clubs need a delivery address first.
      if (plan.kind === 'box') return router.push({ pathname: '/subscribe', params: { plan: plan.slug } });
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
      <View style={{ alignItems: 'center', maxWidth: 760, alignSelf: 'center', gap: wide ? 14 : 10, marginBottom: wide ? 48 : 28, marginTop: wide ? 8 : 0 }}>
        <Eyebrow center>{t('membership')}</Eyebrow>
        <Serif role="h1" size={wide ? 56 : 36} center>{t('memberTitle')}</Serif>
        <Ornament align="center" width={wide ? 112 : 88} />
        <T size={wide ? 16.5 : 15} lh={1.65} color={colors.body} center style={{ marginTop: 4 }}>{t('memberBody')}</T>
      </View>
      {msg && <Notice text={msg} />}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 28 : 18, maxWidth: 1000, width: '100%', alignSelf: 'center', alignItems: 'stretch' }}>
        {plans.map((p) => {
          const featured = p.kind === 'membership';
          const body = (
            <View style={{ flex: 1, gap: 14 }}>
              <Eyebrow color={featured ? colors.emerald : colors.brassText}>{t(p.kind === 'membership' ? 'kind_membership' : 'kind_box')}</Eyebrow>
              <Serif size={wide ? 38 : 30}>{pick(p, 'name')}</Serif>
              <Ornament width={72} />
              <T size={14.5} lh={1.7} color={colors.body}>{pick(p, 'description')}</T>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6, paddingTop: 16, borderTopWidth: 1, borderColor: colors.line }}>
                <T w={500} size={26} num color={colors.navy}>{formatMoney(convertFromSar(p.price_sar, currency), currency, lang)}</T>
                <T size={13.5} color={colors.muted}>/ {t(p.period === 'year' ? 'perYear' : 'perMonth')}</T>
              </View>
              <T size={12} color={colors.muted}>{t('vatIncluded')}</T>
              <Button label={t('join')} kind={featured ? 'primary' : 'secondary'} busy={busy === p.id} onPress={() => join(p)} style={{ marginTop: 'auto', alignSelf: 'stretch' }} />
            </View>
          );
          return featured
            ? <DoubleFrame key={p.id} pad={wide ? 34 : 22} gap={5} style={{ flex: 1, backgroundColor: colors.porcelain }}>{body}</DoubleFrame>
            : <View key={p.id} style={{ flex: 1, backgroundColor: colors.porcelain, borderWidth: 1, borderColor: colors.line, padding: wide ? 40 : 28 }}>{body}</View>;
        })}
      </View>

      <View style={{ marginTop: wide ? 72 : 40, maxWidth: 1000, width: '100%', alignSelf: 'center', borderTopWidth: 1, borderColor: colors.goldLine }}>
        {faqs.map(([q, a], i) => (
          <View key={q} style={{ borderBottomWidth: 1, borderColor: colors.line }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: faq === i }} onPress={() => setFaq(faq === i ? null : i)}
              style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 64, gap: 12 }}>
              <T w={500} size={15.5} color={colors.navy} style={{ flex: 1 }}>{q}</T>
              <Icon name={faq === i ? 'minus' : 'plus'} size={16} stroke={1.3} color={colors.brass} />
            </Pressable>
            {faq === i && <T size={14.5} lh={1.7} color={colors.body} style={{ paddingBottom: 20, maxWidth: 760 }}>{a}</T>}
          </View>
        ))}
      </View>
    </Screen>
  );
}
