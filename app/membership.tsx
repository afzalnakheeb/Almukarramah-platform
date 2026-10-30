// Membership: a centred head, plans on porcelain (the membership double-ruled in gold), answers between hairlines.
// Website prices come from the plans table. In the iPhone and Android apps the membership is sold by the App Store or
// Google Play (RevenueCat): its price, renewal terms, the terms and privacy links and "Restore purchases" come from and
// follow the store's rules, and it is shown only when the store offers it. Box clubs (physical) are paid with Moyasar.
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
import { openExternal } from '@/lib/links';
import { convertFromSar, formatMoney } from '@/lib/money';
import { buyMembership, getMembershipOffer, restoreMembership, storeMembershipActive, type MembershipOffer } from '@/lib/purchases';
import { useSession } from '@/lib/session';
import { callFunction, supabase } from '@/lib/supabase';
import type { Plan } from '@/lib/types';
import { colors } from '@/theme';
import { faqLd, Seo } from '@/components/seo';

/** Apple's standard licence agreement, which applies to App Store purchases (no custom EULA is set in App Store Connect). */
const APPLE_EULA = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** A plan's description: a list with green ticks when it names several benefits, otherwise one quiet paragraph. */
function Benefits({ text }: { text: string }) {
  const parts = text.replace(/[.。]\s*$/, '').split(/\s*[,،]\s*/).filter(Boolean);
  if (parts.length < 3) return <T size={14.5} lh={1.7} color={colors.body}>{text}</T>;
  return (
    <View style={{ gap: 10 }}>
      {parts.map((x) => (
        <View key={x} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={{ marginTop: 3 }}><Icon name="check" size={14} stroke={1.6} color={colors.emerald} /></View>
          <T size={14.5} lh={1.5} color={colors.body} style={{ flex: 1 }}>{x.charAt(0).toUpperCase() + x.slice(1)}</T>
        </View>
      ))}
    </View>
  );
}

export default function Membership() {
  const wide = useWide();
  const { t, pick, currency, lang } = useI18n();
  const { session } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [faq, setFaq] = useState<number | null>(0);
  const native = Platform.OS !== 'web';
  const [offer, setOffer] = useState<MembershipOffer | null>(null);
  const [member, setMember] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    getPlans().then(setPlans).catch(() => undefined);
  }, []);
  // Apps: the store's own offer (price in the shopper's App Store / Google Play currency).
  useEffect(() => {
    if (native) getMembershipOffer().then(setOffer);
  }, [native]);
  // Apps: members get the way into the Quran Trail, the lessons the membership opens.
  useEffect(() => {
    if (!native || !session) {
      setMember(false);
      return;
    }
    let live = true;
    const inDb = supabase.from('subscriptions').select('id, plans!inner(kind)').eq('plans.kind', 'membership').eq('status', 'active').limit(1)
      .then(({ data }) => (data ?? []).length > 0, () => false);
    Promise.all([inDb, storeMembershipActive()]).then(([db, store]) => { if (live) setMember(db || store); });
    return () => { live = false; };
  }, [native, session]);

  async function join(plan: Plan) {
    if (!session) return setMsg(t('signInToJoin'));
    setBusy(plan.id);
    setMsg(null);
    try {
      // Digital membership inside the iPhone/Android app must use app-store billing.
      if (plan.kind === 'membership' && native) {
        const result = await buyMembership();
        if (result === 'purchased') {
          setMsg(t('iapThanks'));
          setMember(true);
        } else if (result === 'unavailable') setMsg(t('iapUnavailable'));
        return;
      }
      // Box clubs need a delivery address first.
      if (plan.kind === 'box') return router.push({ pathname: '/subscribe', params: { plan: plan.slug } });
      // Website membership and physical box clubs are paid through Moyasar (card saved for monthly renewal).
      const res = await callFunction<{ paymentUrl: string }>('create-payment', { planId: plan.id, lang });
      if (Platform.OS === 'web') window.location.href = res.paymentUrl;
      else await WebBrowser.openBrowserAsync(res.paymentUrl);
    } catch (e) {
      setMsg(plan.kind === 'membership' && native ? t('iapError') : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (!session) return setMsg(t('signInToJoin'));
    setRestoring(true);
    setMsg(null);
    try {
      const ok = await restoreMembership();
      setMsg(t(ok ? 'restoreDone' : 'restoreNone'));
      if (ok) setMember(true);
    } catch {
      setMsg(t('iapError'));
    } finally {
      setRestoring(false);
    }
  }

  // In the apps the membership appears only when the store sells it; never with our own price or a link elsewhere.
  const shown = plans.filter((p) => !(native && p.kind === 'membership' && !offer));
  // The second answer names both stores: on the website only (an app names only its own store).
  const faqs = native ? [[t('faq1q'), t('faq1a')]] : [[t('faq1q'), t('faq1a')], [t('faq2q'), t('faq2a')]];

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
      {msg === t('signInToJoin') && (
        <Button label={t('signIn')} size="sm" href={{ pathname: '/account', params: { next: '/membership' } }} style={{ alignSelf: 'center', marginBottom: 16 }} />
      )}
      {native && member && (
        <View style={{ maxWidth: 1000, width: '100%', alignSelf: 'center', marginBottom: 18, backgroundColor: colors.porcelain, borderWidth: 1, borderColor: colors.line, borderTopColor: colors.emerald, padding: 20, gap: 10 }}>
          <Eyebrow color={colors.emerald}>{t('youAreMember')}</Eyebrow>
          <Button label={t('openQuranTrail')} href={{ pathname: '/trail/[slug]', params: { slug: 'quran-trail' } }} style={{ alignSelf: 'flex-start' }} />
        </View>
      )}

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 28 : 18, maxWidth: 1000, width: '100%', alignSelf: 'center', alignItems: 'stretch' }}>
        {shown.map((p) => {
          const featured = p.kind === 'membership';
          // App-store membership: the store's price and period; everything else: our VAT-inclusive price.
          const store = native && featured && offer ? offer : null;
          const body = (
            <View style={{ flex: 1, gap: 14 }}>
              <Eyebrow color={featured ? colors.emerald : colors.brassText}>{t(p.kind === 'membership' ? 'kind_membership' : 'kind_box')}</Eyebrow>
              <Serif size={wide ? 38 : 30}>{pick(p, 'name')}</Serif>
              <Ornament width={72} />
              <Benefits text={pick(p, 'description')} />
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6, paddingTop: 18, borderTopWidth: 1, borderColor: colors.line }}>
                <T w={500} size={wide ? 30 : 26} num color={colors.navy} style={{ letterSpacing: 0.2 }}>{store ? store.priceString : formatMoney(convertFromSar(p.price_sar, currency), currency, lang)}</T>
                <T size={13.5} color={colors.muted}>/ {t((store ? store.period : p.period) === 'year' ? 'perYear' : 'perMonth')}</T>
              </View>
              {!store && <T size={12} color={colors.muted}>{t('vatIncluded')}</T>}
              <Button label={t('join')} kind={featured ? 'primary' : 'secondary'} busy={busy === p.id} onPress={() => join(p)} style={{ marginTop: 'auto', alignSelf: 'stretch' }} />
              {store && (
                <View style={{ gap: 6 }}>
                  <T size={11.5} lh={1.55} color={colors.muted}>{t(Platform.OS === 'ios' ? 'iapAutoRenewIos' : 'iapAutoRenewAndroid')}</T>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 }}>
                    <Button kind="text" size="sm" label={t('termsOfService')} href="/terms" />
                    <Button kind="text" size="sm" label={t('privacyPolicy')} href="/privacy" />
                    {Platform.OS === 'ios' && <Button kind="text" size="sm" label={t('appleEula')} onPress={() => openExternal(APPLE_EULA)} />}
                  </View>
                  <Button kind="quiet" size="sm" label={t('restorePurchases')} busy={restoring} onPress={restore} style={{ alignSelf: 'flex-start' }} />
                </View>
              )}
            </View>
          );
          // Side by side on wide screens (equal heights); stacked on phones, each as tall as its content (flex: 1 there
          // squeezed the membership card under the next one and hid its Join button).
          return featured
            ? <DoubleFrame key={p.id} pad={wide ? 34 : 22} gap={5} style={{ flex: wide ? 1 : undefined, backgroundColor: colors.porcelain }}>{body}</DoubleFrame>
            : <View key={p.id} style={{ flex: wide ? 1 : undefined, backgroundColor: colors.porcelain, borderWidth: 1, borderColor: colors.line, padding: wide ? 40 : 28 }}>{body}</View>;
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
