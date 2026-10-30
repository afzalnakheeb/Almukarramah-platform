// Seller shop settings: public profile (both languages), where they ship and what it costs, returns, contact details.
import React, { useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { countryName } from '@/components/country';
import { Seo } from '@/components/seo';
import { Button, Card, Field, Notice, Serif, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { updateSeller, updateSellerPrivate } from '@/lib/seller';
import { useSeller } from '@/lib/seller-context';
import { colors } from '@/theme';


export default function SellerShop() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const { me, reload } = useSeller();
  const s = me.seller;
  const [f, setF] = useState({
    name_ar: s.name_ar ?? '', tagline_en: s.tagline_en ?? '', tagline_ar: s.tagline_ar ?? '', about_en: s.about_en ?? '', about_ar: s.about_ar ?? '',
    city: s.city ?? '', website: s.website ?? '', returns_en: s.returns_en ?? '', returns_ar: s.returns_ar ?? '',
    handling_days: String(s.handling_days ?? 3),
  });
  const [p, setP] = useState({ contact_name: me.private?.contact_name ?? '', contact_email: me.private?.contact_email ?? '', contact_phone: me.private?.contact_phone ?? '', legal_name: me.private?.legal_name ?? '', registration_no: me.private?.registration_no ?? '', tax_registration_no: me.private?.tax_registration_no ?? '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const setPv = (k: keyof typeof p) => (v: string) => setP((x) => ({ ...x, [k]: v }));

  async function save() {
    setBusy(true); setMsg(null);
    try {
      await updateSeller(s.id, {
        name_ar: f.name_ar.trim() || null, tagline_en: f.tagline_en.trim() || null, tagline_ar: f.tagline_ar.trim() || null,
        about_en: f.about_en.trim() || null, about_ar: f.about_ar.trim() || null, city: f.city.trim() || null, website: f.website.trim() || null,
        returns_en: f.returns_en.trim() || null, returns_ar: f.returns_ar.trim() || null,
        handling_days: Math.min(10, Math.max(1, Number(f.handling_days) || 3)),
      });
      await updateSellerPrivate(s.id, { ...p, contact_phone: p.contact_phone || null, legal_name: p.legal_name || null, registration_no: p.registration_no || null, tax_registration_no: p.tax_registration_no || null });
      await reload();
      setMsg({ tone: 'ok', text: t('pfSaved') });
    } catch (e) {
      setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) });
    } finally { setBusy(false); }
  }

  const row = (children: React.ReactNode) => <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 14 : 0 }}>{children}</View>;
  const col = (children: React.ReactNode) => <View style={{ flex: 1 }}>{children}</View>;
  const card = (title: string, children: React.ReactNode, hint?: string) => (
    <Card pad={wide ? 22 : 14} style={{ gap: 6 }}>
      <T w={700} size={16} color={colors.navy}>{title}</T>
      {hint ? <T size={13} color={colors.muted} lh={1.5} style={{ marginBottom: 6 }}>{hint}</T> : null}
      {children}
    </Card>
  );

  return (
    <Screen chrome="none" style={{ maxWidth: 1000 }}>
      <Seo title="Shop settings | Seller | Al Mukarramah" description="Seller settings." path="/seller/shop" noindex />
      <Serif role="h1" size={wide ? 40 : 30}>{t('sdShop')}</Serif>
      <T size={13.5} color={colors.muted} style={{ marginVertical: 8 }}>{s.name_en} · {countryName(s.country, lang)}{s.status === 'approved' ? ` · almukarramah.com/sellers/${s.slug}` : ''}</T>
      <View style={{ gap: 14 }}>
        {card(t('ssProfile'), <>
          {row(<>{col(<Field label={t('shopNameAr')} value={f.name_ar} onChangeText={set('name_ar')} style={{ writingDirection: 'rtl', textAlign: 'right' }} />)}{col(<Field label={t('city')} value={f.city} onChangeText={set('city')} />)}</>)}
          {row(<>{col(<Field label={t('shopTagline')} value={f.tagline_en} onChangeText={set('tagline_en')} maxLength={140} />)}{col(<Field label={t('shopTaglineAr')} value={f.tagline_ar} onChangeText={set('tagline_ar')} maxLength={140} style={{ writingDirection: 'rtl', textAlign: 'right' }} />)}</>)}
          <Field label={t('ssAboutEn')} value={f.about_en} onChangeText={set('about_en')} multiline maxLength={2000} />
          <Field label={t('ssAboutAr')} value={f.about_ar} onChangeText={set('about_ar')} multiline maxLength={2000} style={{ writingDirection: 'rtl', textAlign: 'right' }} />
          <Field label={t('website')} value={f.website} onChangeText={set('website')} autoCapitalize="none" dirLtr />
        </>, t('ssProfileHint'))}

        {card(t('ssShipping'), <>
          <Field label={t('ssHandlingDays')} value={f.handling_days} onChangeText={set('handling_days')} keyboardType="number-pad" hint={t('ssHandlingHint')} dirLtr />
        </>, t('ssShippingHint'))}

        {card(t('ssReturns'), <>
          <Field label={t('ssReturnsEn')} value={f.returns_en} onChangeText={set('returns_en')} multiline maxLength={1500} />
          <Field label={t('ssReturnsAr')} value={f.returns_ar} onChangeText={set('returns_ar')} multiline maxLength={1500} style={{ writingDirection: 'rtl', textAlign: 'right' }} />
        </>, t('ssReturnsHint'))}

        {card(t('ssPrivate'), <>
          {row(<>{col(<Field label={t('contactName')} value={p.contact_name} onChangeText={setPv('contact_name')} />)}{col(<Field label={t('contactEmail')} value={p.contact_email} onChangeText={setPv('contact_email')} autoCapitalize="none" dirLtr />)}{col(<Field label={t('contactPhone')} value={p.contact_phone} onChangeText={setPv('contact_phone')} dirLtr />)}</>)}
          {row(<>{col(<Field label={t('legalName')} value={p.legal_name} onChangeText={setPv('legal_name')} />)}{col(<Field label={t('registrationNo')} value={p.registration_no} onChangeText={setPv('registration_no')} dirLtr />)}{col(<Field label={t('vatNo')} value={p.tax_registration_no} onChangeText={setPv('tax_registration_no')} dirLtr />)}</>)}
        </>, t('ssPrivateHint'))}

        {msg && <Notice tone={msg.tone} text={msg.text} />}
        <Button label={t('save')} size="lg" busy={busy} onPress={save} style={{ alignSelf: 'flex-start' }} />
      </View>
    </Screen>
  );
}
