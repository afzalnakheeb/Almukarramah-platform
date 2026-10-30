// Sell on Al Mukarramah: what the marketplace is, how approval works, and the seller application.
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Glow, Ornament, StarLattice } from '@/components/decor';
import { Icon, type IconName } from '@/components/icons';
import { Seo } from '@/components/seo';
import { Button, Card, Chip, Container, Eyebrow, Field, Notice, Serif, T, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import { MARKET_DEMO, departments, useGuidance } from '@/lib/market';
import { RELATIONSHIPS, applyAsSeller, useMySeller } from '@/lib/seller';
import { colors } from '@/theme';

const STEPS: [IconName, Key, Key][] = [
  ['user', 'sellStep1t', 'sellStep1b'],
  ['shield', 'sellStep2t', 'sellStep2b'],
  ['sparkle', 'sellStep3t', 'sellStep3b'],
  ['send', 'sellStep4t', 'sellStep4b'],
];
const WHY: [IconName, Key, Key][] = [
  ['globe', 'sellWhy1t', 'sellWhy1b'],
  ['lock', 'sellWhy2t', 'sellWhy2b'],
  ['gift', 'sellWhy3t', 'sellWhy3b'],
];

export default function Sell() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const g = useGuidance();
  const live = useMySeller();
  // the screenshot build shows the form as a signed-in visitor without a seller account would see it
  const { me, loading, session } = MARKET_DEMO ? { me: null, loading: false, session: { user: { email: 'you@example.com' } } } : live;
  const [f, setF] = useState({ name_en: '', name_ar: '', tagline_en: '', country: 'SA', city: '', website: '', contact_name: '', contact_email: '', contact_phone: '', legal_name: '', registration_no: '', product_summary: '', relationship: '', years_in_business: '', social: '', brand_story: '' });
  const [cats, setCats] = useState<string[]>([]);
  // countries we take sellers from: open ones first, then by phase
  const countries = [...(g.seller_countries ?? [{ code: 'SA', name_en: 'Saudi Arabia', name_ar: 'المملكة العربية السعودية', open: true, phase: 1 }])]
    .sort((a, b) => Number(b.open) - Number(a.open) || (a.phase ?? 9) - (b.phase ?? 9) || a.code.localeCompare(b.code));
  const chosen = countries.find((c) => c.code === f.country);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  async function submit() {
    setError(null);
    if (!f.name_en.trim() || !f.country || !f.contact_name.trim() || !f.product_summary.trim() || !f.relationship || !cats.length) return setError(t('sellRequired'));
    if ([f.website, f.social].some((x) => x.trim() && !/^https:\/\/\S{3,}$/i.test(x.trim()))) return setError(t('sellHttps'));
    if (!agree) return setError(t('sellAgreeFirst'));
    if (MARKET_DEMO) return setError(t('lfDemo'));
    setBusy(true);
    try {
      const { social, ...rest } = f;
      await applyAsSeller({ ...rest, links: [f.website, social].map((x) => x.trim()).filter(Boolean), categories: cats, agree: true });
      router.replace('/seller');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const form = !session ? (
    <Card pad={wide ? 28 : 18} style={{ gap: 12, borderRadius: 22, borderColor: colors.champagne }}>
      <Serif size={wide ? 32 : 26}>{t('sellApplyTitle')}</Serif>
      <T color={colors.body}>{t('sellSignInFirst')}</T>
      <Button label={t('signInToApply')} href={{ pathname: '/account', params: { next: '/sell' } }} style={{ alignSelf: 'flex-start' }} />
    </Card>
  ) : me ? (
    <Card pad={wide ? 28 : 18} style={{ gap: 12, borderRadius: 22, borderColor: colors.champagne }}>
      <Serif size={wide ? 32 : 26}>{me.seller.name_en}</Serif>
      <T color={colors.body}>{t('sellHaveAccount')}</T>
      <Button label={t('openSellerDashboard')} href="/seller" style={{ alignSelf: 'flex-start' }} />
    </Card>
  ) : (
    <Card pad={wide ? 28 : 18} style={{ gap: 4, borderRadius: 22, borderColor: colors.champagne }}>
      <Serif size={wide ? 32 : 26} style={{ marginBottom: 8 }}>{t('sellApplyTitle')}</Serif>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 16 : 0 }}>
        <View style={{ flex: 1 }}><Field label={`${t('shopNameEn')} *`} value={f.name_en} onChangeText={set('name_en')} maxLength={80} /></View>
        <View style={{ flex: 1 }}><Field label={t('shopNameAr')} value={f.name_ar} onChangeText={set('name_ar')} maxLength={80} style={{ writingDirection: 'rtl', textAlign: 'right' }} /></View>
      </View>
      <Field label={t('shopTagline')} value={f.tagline_en} onChangeText={set('tagline_en')} maxLength={140} hint={t('shopTaglineHint')} />
      <T w={500} size={12.5} color={colors.body}>{t('shipsFromCountry')} *</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {countries.map((c) => <Chip key={c.code} size="sm" label={lang === 'ar' ? c.name_ar : c.name_en} active={f.country === c.code} onPress={() => set('country')(c.code)} />)}
      </View>
      {chosen && !chosen.open ? <T size={13} lh={1.5} color={colors.brassText} style={{ marginBottom: 8 }}>{t('sellCountryClosed').replace('{country}', lang === 'ar' ? chosen.name_ar : chosen.name_en)}</T> : null}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 16 : 0 }}>
        <View style={{ flex: 1 }}><Field label={t('city')} value={f.city} onChangeText={set('city')} /></View>
        <View style={{ flex: 1 }}><Field label={`${t('apYears')} *`} value={f.years_in_business} onChangeText={(v) => set('years_in_business')(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" dirLtr /></View>
      </View>
      <T w={500} size={12.5} color={colors.body}>{t('apRelationship')} *</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {RELATIONSHIPS.map((r) => <Chip key={r} size="sm" label={t(`apRel_${r}` as Key)} active={f.relationship === r} onPress={() => set('relationship')(r)} />)}
      </View>
      <T w={500} size={12.5} color={colors.body}>{t('sellCategories')} *</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {departments(g).map((d) => <Chip key={d.id} size="sm" label={lang === 'ar' ? d.name_ar : d.name_en} active={cats.includes(d.id)} onPress={() => setCats(cats.includes(d.id) ? cats.filter((x) => x !== d.id) : [...cats, d.id])} />)}
      </View>
      <Field label={`${t('whatYouSell')} *`} value={f.product_summary} onChangeText={set('product_summary')} multiline maxLength={2000} hint={t('whatYouSellHint')} />
      <Field label={t('sellStoryOptional')} value={f.brand_story} onChangeText={set('brand_story')} multiline maxLength={3000} />
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 16 : 0 }}>
        <View style={{ flex: 1 }}><Field label={`${t('contactName')} *`} value={f.contact_name} onChangeText={set('contact_name')} /></View>
        <View style={{ flex: 1 }}><Field label={t('contactEmail')} value={f.contact_email} onChangeText={set('contact_email')} keyboardType="email-address" autoCapitalize="none" placeholder={session.user.email ?? ''} dirLtr /></View>
        <View style={{ flex: 1 }}><Field label={t('contactPhone')} value={f.contact_phone} onChangeText={set('contact_phone')} keyboardType="phone-pad" dirLtr /></View>
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 16 : 0 }}>
        <View style={{ flex: 1 }}><Field label={t('legalName')} value={f.legal_name} onChangeText={set('legal_name')} /></View>
        <View style={{ flex: 1 }}><Field label={t('registrationNo')} value={f.registration_no} onChangeText={set('registration_no')} dirLtr /></View>
        <View style={{ flex: 1 }}><Field label={t('website')} value={f.website} onChangeText={set('website')} autoCapitalize="none" keyboardType="url" placeholder="https://" dirLtr /></View>
      </View>
      <Field label={t('sellSocial')} value={f.social} onChangeText={set('social')} autoCapitalize="none" keyboardType="url" placeholder="https://" dirLtr />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginVertical: 8 }}>
        <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: colors.navy, backgroundColor: agree ? colors.navy : colors.white, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
          {agree && <Icon name="check" size={16} color={colors.white} stroke={2.4} />}
        </View>
        <T size={14} lh={1.5} style={{ flex: 1 }}>{t('sellAgree')}</T>
      </Pressable>
      <Button label={t('guidelinesRead')} kind="text" href="/sell/guidelines" style={{ alignSelf: 'flex-start' }} />
      {error && <Notice tone="warn" text={error} />}
      <Button label={t('sendApplication')} size="lg" busy={busy} onPress={submit} style={{ alignSelf: wide ? 'flex-start' : 'stretch', marginTop: 6 }} />
    </Card>
  );

  return (
    <Screen padded={false}>
      <Seo title="Sell on Al Mukarramah | Islamic and modest brands" description="Apply to sell your Islamic gifts, fragrance and modest fashion on Al Mukarramah, the marketplace from Madinah. Every seller and listing is approved by our team." path="/sell" />
      <View style={{ backgroundColor: colors.night, overflow: 'hidden' }}>
        <StarLattice opacity={0.07} size={70} />
        <Glow cx="80%" cy="30%" r="55%" opacity={0.22} />
        <Container style={{ paddingVertical: wide ? 72 : 32, gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 28, height: 1, backgroundColor: colors.gold }} />
            <Eyebrow size={wide ? 13 : 11} color={colors.gold}>{t('sellPageKicker')}</Eyebrow>
          </View>
          <Serif role="h1" size={wide ? 64 : 38} color={colors.white} style={{ maxWidth: 820 }}>{t('sellPageTitle')}</Serif>
          <Ornament width={110} />
          <T size={wide ? 18 : 15} lh={1.65} color={colors.onNight} style={{ maxWidth: 700 }}>{t('sellPageBody')}</T>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, marginTop: 6 }}>
            <Button label={t('sellApplyNow')} kind="gold" size="lg" onPress={() => { if (typeof document !== 'undefined') document.getElementById('apply')?.scrollIntoView({ behavior: 'smooth' }); }} />
            <Button label={t('guidelinesRead')} kind="outlineLight" size="lg" href="/sell/guidelines" />
          </View>
        </Container>
      </View>

      <Container style={{ paddingVertical: wide ? 56 : 28, gap: wide ? 40 : 24 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {WHY.map(([ic, a, b]) => (
            <Card key={a} pad={wide ? 24 : 16} style={{ flexGrow: 1, flexBasis: wide ? 280 : '100%', gap: 10, borderColor: colors.champagne }}>
              <View style={{ width: 46, height: 46, borderRadius: 999, backgroundColor: colors.night, borderWidth: 1, borderColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name={ic} size={21} color={colors.goldBright} stroke={1.6} />
              </View>
              <T w={700} size={16} color={colors.navy}>{t(a)}</T>
              <T size={14} lh={1.55} color={colors.body}>{t(b)}</T>
            </Card>
          ))}
        </View>

        <View style={{ gap: 14 }}>
          <Serif role="h2" size={wide ? 40 : 28}>{t('sellHowTitle')}</Serif>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: 14 }}>
            {STEPS.map(([ic, a, b], i) => (
              <View key={a} style={{ flex: 1, flexDirection: wide ? 'column' : 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Serif size={34} color={colors.brass}>{i + 1}</Serif>
                  <Icon name={ic} size={20} color={colors.brass} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <T w={700} size={15.5} color={colors.navy}>{t(a)}</T>
                  <T size={13.5} lh={1.55} color={colors.body}>{t(b)}</T>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View nativeID="apply" style={{ maxWidth: 980 }}>
          {loading ? <T color={colors.muted}>…</T> : form}
        </View>
      </Container>
    </Screen>
  );
}
