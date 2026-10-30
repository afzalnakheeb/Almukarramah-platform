// Seller shop settings: the public profile in both languages, logo and banner (screened, published by our team),
// handling time and pickup addresses (model B: our courier collects from the seller), returns text and contact.
// Legal, tax and bank details live in the seller's file (/seller/application).
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { countryName } from '@/components/country';
import { PickFiles } from '@/components/pick-files';
import { Seo } from '@/components/seo';
import { Button, Card, Field, Notice, Photo, Serif, T, Tag, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import { MARKET_DEMO } from '@/lib/market';
import {
  mediaFor, mySellerFile, photoUrls, removeLocation, saveLocation, updateSeller, updateSellerPrivate, uploadMedia,
  type MediaAsset, type SellerLocation,
} from '@/lib/seller';
import { useSeller } from '@/lib/seller-context';
import { colors } from '@/theme';

const EMPTY_LOC = { label: 'Main', contact_name: '', phone: '', city: '', district: '', line1: '', line2: '', postal_code: '', short_address: '', pickup_from: '10:00', pickup_to: '18:00' };
const PHOTO_TONE = { pending: 'info', passed: 'ok', review: 'warn', rejected: 'err', blocked: 'err' } as const;

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
  const [p, setP] = useState({ contact_name: me.private?.contact_name ?? '', contact_email: me.private?.contact_email ?? '', contact_phone: me.private?.contact_phone ?? '' });
  const [locations, setLocations] = useState<SellerLocation[]>([]);
  const [loc, setLoc] = useState<(typeof EMPTY_LOC & { id?: string }) | null>(null);
  const [art, setArt] = useState<Record<string, MediaAsset>>({});
  const [artUrls, setArtUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const setPv = (k: keyof typeof p) => (v: string) => setP((x) => ({ ...x, [k]: v }));
  const editable = !MARKET_DEMO;

  const loadExtras = async () => {
    const file = await mySellerFile(s.id);
    setLocations(file.locations);
    const paths = [s.logo, s.banner].filter(Boolean) as string[];
    const [m, u] = await Promise.all([mediaFor(paths), photoUrls(paths)]);
    setArt(m); setArtUrls(u);
  };
  useEffect(() => { loadExtras().catch(() => undefined); }, [s.id, s.logo, s.banner]);

  const run = async (key: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(key); setMsg(null);
    try { await fn(); if (ok) setMsg({ tone: 'ok', text: ok }); }
    catch (e) { setMsg({ tone: 'warn', text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(null); }
  };

  const save = () => run('save', async () => {
    await updateSeller(s.id, {
      name_ar: f.name_ar.trim() || null, tagline_en: f.tagline_en.trim() || null, tagline_ar: f.tagline_ar.trim() || null,
      about_en: f.about_en.trim() || null, about_ar: f.about_ar.trim() || null, city: f.city.trim() || null, website: f.website.trim() || null,
      returns_en: f.returns_en.trim() || null, returns_ar: f.returns_ar.trim() || null,
      handling_days: Math.min(10, Math.max(1, Number(f.handling_days) || 3)),
    });
    await updateSellerPrivate(s.id, { contact_name: p.contact_name.trim(), contact_email: p.contact_email.trim(), contact_phone: p.contact_phone.trim() || null });
    await reload();
  }, t('pfSaved'));

  const uploadArt = (field: 'logo' | 'banner', files: File[]) => run(field, async () => {
    const r = await uploadMedia(s.id, files[0], field === 'logo' ? 'seller_logo' : 'seller_banner');
    if (!r.asset?.path || ['rejected', 'blocked'].includes(r.asset.status)) throw new Error(r.reasons.map((x) => (lang === 'ar' ? x.ar : x.en)).join(' ') || t('lfPhotoStatus_rejected'));
    await updateSeller(s.id, { [field]: r.asset.path });
    await reload();
  });

  const saveLoc = () => loc && run('loc', async () => {
    await saveLocation(s.id, {
      ...loc, country: s.country, district: loc.district || null, line2: loc.line2 || null, postal_code: loc.postal_code || null,
      short_address: loc.short_address ? loc.short_address.toUpperCase().replace(/\s/g, '') : null, is_default: loc.id ? undefined : !locations.length,
    } as never);
    setLoc(null);
    await loadExtras();
  }, t('pfSaved'));

  const row = (children: React.ReactNode) => <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 14 : 0 }}>{children}</View>;
  const col = (children: React.ReactNode) => <View style={{ flex: 1 }}>{children}</View>;
  const card = (title: string, children: React.ReactNode, hint?: string) => (
    <Card pad={wide ? 22 : 14} style={{ gap: 6 }}>
      <T w={700} size={16} color={colors.navy}>{title}</T>
      {hint ? <T size={13} color={colors.muted} lh={1.5} style={{ marginBottom: 6 }}>{hint}</T> : null}
      {children}
    </Card>
  );
  const artTile = (field: 'logo' | 'banner') => {
    const path = s[field];
    const published = !!path && /^https:\/\//.test(path);
    const a = path ? art[path] : undefined;
    return (
      <View style={{ flex: 1, gap: 6, minWidth: 200 }}>
        <T w={500} size={12.5} color={colors.body}>{t(field === 'logo' ? 'ssLogoLabel' : 'ssBannerLabel')}</T>
        <Photo uri={path ? artUrls[path] ?? (published ? path : undefined) : undefined} ratio={field === 'logo' ? 1 : 3} tone={colors.sandSoft} fit="contain"
          style={{ maxWidth: field === 'logo' ? 140 : undefined, borderWidth: 1, borderColor: colors.line }} />
        {path ? <Tag label={published ? t('ssPublished') : a && a.status !== 'passed' ? t(`lfPhotoStatus_${a.status}` as Key) : t('ssWaitingPublish')}
          tone={published ? 'ok' : a ? PHOTO_TONE[a.status] : 'info'} /> : null}
        <PickFiles label={busy === field ? t('lfChecking') : t(field === 'logo' ? 'ssUploadLogo' : 'ssUploadBanner')} multiple={false} disabled={!editable || !!busy} onFiles={(fl) => uploadArt(field, fl)} />
      </View>
    );
  };

  return (
    <Screen chrome="none" style={{ maxWidth: 1000 }}>
      <Seo title="Shop settings | Seller | Al Mukarramah" description="Seller settings." path="/seller/shop" noindex />
      <Serif role="h1" size={wide ? 40 : 30}>{t('sdShop')}</Serif>
      <T size={13.5} color={colors.muted} style={{ marginVertical: 8 }}>{s.name_en} · {countryName(s.country, lang)}{s.status === 'approved' ? ` · almukarramah.com/sellers/${s.slug}` : ''}</T>
      {MARKET_DEMO ? <Notice text={t('lfDemo')} /> : null}
      <View style={{ gap: 14 }}>
        {card(t('ssProfile'), <>
          {row(<>{col(<Field label={t('shopNameAr')} value={f.name_ar} onChangeText={set('name_ar')} style={{ writingDirection: 'rtl', textAlign: 'right' }} />)}{col(<Field label={t('city')} value={f.city} onChangeText={set('city')} />)}</>)}
          {row(<>{col(<Field label={t('shopTagline')} value={f.tagline_en} onChangeText={set('tagline_en')} maxLength={140} />)}{col(<Field label={t('shopTaglineAr')} value={f.tagline_ar} onChangeText={set('tagline_ar')} maxLength={140} style={{ writingDirection: 'rtl', textAlign: 'right' }} />)}</>)}
          <Field label={t('ssAboutEn')} value={f.about_en} onChangeText={set('about_en')} multiline maxLength={2000} />
          <Field label={t('ssAboutAr')} value={f.about_ar} onChangeText={set('about_ar')} multiline maxLength={2000} style={{ writingDirection: 'rtl', textAlign: 'right' }} />
          <Field label={t('website')} value={f.website} onChangeText={set('website')} autoCapitalize="none" dirLtr />
        </>, t('ssProfileHint'))}

        {card(t('ssLogo'), <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>{artTile('logo')}{artTile('banner')}</View>, t('ssLogoHint'))}

        {card(t('ssShipping'), <>
          <Field label={t('ssHandlingDays')} value={f.handling_days} onChangeText={set('handling_days')} keyboardType="number-pad" hint={t('ssHandlingHint')} dirLtr />
        </>, t('ssShippingHint'))}

        {card(t('ssPickup'), <>
          {locations.map((l) => (
            <View key={l.id} style={{ flexDirection: wide ? 'row' : 'column', gap: 8, alignItems: wide ? 'center' : 'flex-start', borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 10 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T w={600} size={14}>{l.label}{l.is_default ? ` · ${t('ssDefault')}` : ''}</T>
                <T size={13} color={colors.body}>{l.line1}{l.line2 ? `, ${l.line2}` : ''}, {l.district ? `${l.district}, ` : ''}{l.city} · {l.contact_name} · {l.phone}</T>
                <T size={12.5} color={colors.muted} num>{t('ssPickupHours')}: {l.pickup_from.slice(0, 5)}–{l.pickup_to.slice(0, 5)}{l.short_address ? ` · ${l.short_address}` : ''}</T>
              </View>
              {editable ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button label={t('edit')} kind="text" size="sm" onPress={() => setLoc({ ...EMPTY_LOC, ...l, district: l.district ?? '', line2: l.line2 ?? '', postal_code: l.postal_code ?? '', short_address: l.short_address ?? '' })} />
                  {!l.is_default ? <Button label={t('ssMakeDefault')} kind="text" size="sm" onPress={() => run('loc', async () => {
                    for (const x of locations.filter((y) => y.is_default)) await saveLocation(s.id, { id: x.id, is_default: false });
                    await saveLocation(s.id, { id: l.id, is_default: true });
                    await loadExtras();
                  })} /> : null}
                  {!l.is_default ? <Button label={t('remove')} kind="text" size="sm" onPress={() => run('loc', () => removeLocation(l.id).then(loadExtras))} /> : null}
                </View>
              ) : null}
            </View>
          ))}
          {loc ? (
            <View style={{ gap: 0, borderTopWidth: 1, borderColor: colors.line, paddingTop: 12 }}>
              {row(<>{col(<Field label={t('ssLabel')} value={loc.label} onChangeText={(v) => setLoc({ ...loc, label: v })} maxLength={40} />)}
                {col(<Field label={`${t('contactName')} *`} value={loc.contact_name} onChangeText={(v) => setLoc({ ...loc, contact_name: v })} />)}
                {col(<Field label={`${t('contactPhone')} *`} value={loc.phone} onChangeText={(v) => setLoc({ ...loc, phone: v })} keyboardType="phone-pad" dirLtr />)}</>)}
              {row(<>{col(<Field label={`${t('city')} *`} value={loc.city} onChangeText={(v) => setLoc({ ...loc, city: v })} />)}
                {col(<Field label={t('ssDistrict')} value={loc.district} onChangeText={(v) => setLoc({ ...loc, district: v })} />)}
                {col(<Field label={t('ssPostal')} value={loc.postal_code} onChangeText={(v) => setLoc({ ...loc, postal_code: v })} dirLtr />)}</>)}
              <Field label={`${t('ssLine1')} *`} value={loc.line1} onChangeText={(v) => setLoc({ ...loc, line1: v })} />
              <Field label={t('ssLine2')} value={loc.line2} onChangeText={(v) => setLoc({ ...loc, line2: v })} />
              {row(<>{s.country === 'SA' ? col(<Field label={t('ssShortAddress')} value={loc.short_address} onChangeText={(v) => setLoc({ ...loc, short_address: v.toUpperCase().slice(0, 8) })} autoCapitalize="characters" placeholder="ABCD1234" dirLtr />) : null}
                {col(<Field label={`${t('ssPickupHours')}: ${t('ssFrom')}`} value={loc.pickup_from} onChangeText={(v) => setLoc({ ...loc, pickup_from: v })} placeholder="10:00" dirLtr />)}
                {col(<Field label={t('ssTo')} value={loc.pickup_to} onChangeText={(v) => setLoc({ ...loc, pickup_to: v })} placeholder="18:00" dirLtr />)}</>)}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label={t('ssSaveAddress')} busy={busy === 'loc'} disabled={!loc.contact_name.trim() || !loc.phone.trim() || !loc.city.trim() || !loc.line1.trim()} onPress={saveLoc} />
                <Button label={t('cancel')} kind="text" onPress={() => setLoc(null)} />
              </View>
            </View>
          ) : editable ? <Button label={t('ssAddAddress')} kind="secondary" size="sm" onPress={() => setLoc({ ...EMPTY_LOC, contact_name: p.contact_name, phone: p.contact_phone, city: f.city })} style={{ alignSelf: 'flex-start' }} /> : null}
        </>, t('ssPickupHint').replace('{country}', countryName(s.country, lang)))}

        {card(t('ssReturns'), <>
          <Field label={t('ssReturnsEn')} value={f.returns_en} onChangeText={set('returns_en')} multiline maxLength={1500} />
          <Field label={t('ssReturnsAr')} value={f.returns_ar} onChangeText={set('returns_ar')} multiline maxLength={1500} style={{ writingDirection: 'rtl', textAlign: 'right' }} />
        </>, t('ssReturnsHint'))}

        {card(t('ssPrivate'), <>
          {row(<>{col(<Field label={t('contactName')} value={p.contact_name} onChangeText={setPv('contact_name')} />)}{col(<Field label={t('contactEmail')} value={p.contact_email} onChangeText={setPv('contact_email')} autoCapitalize="none" dirLtr />)}{col(<Field label={t('contactPhone')} value={p.contact_phone} onChangeText={setPv('contact_phone')} dirLtr />)}</>)}
          <Button label={t('sdApplication')} kind="text" size="sm" href="/seller/application" style={{ alignSelf: 'flex-start' }} />
        </>, t('ssPrivateHint'))}

        {msg && <Notice tone={msg.tone} text={msg.text} />}
        <Button label={t('save')} size="lg" busy={busy === 'save'} disabled={!editable} onPress={save} style={{ alignSelf: 'flex-start' }} />
      </View>
    </Screen>
  );
}
