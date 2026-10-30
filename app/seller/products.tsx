// Seller's listings: status of each (draft, waiting, live, rejected), quick stock changes, and links to edit.
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, Chip, Notice, Photo, Serif, T, Tag, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { myListings, photoUrls, setStock, type Listing } from '@/lib/seller';
import { LISTING_TONE, useSeller } from '@/lib/seller-context';
import { colors } from '@/theme';

type Filter = 'all' | Listing['listing_status'];

export default function SellerProducts() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const { me } = useSeller();
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await myListings(me.seller.id);
    setRows(r);
    setUrls(await photoUrls(r.map((x) => x.images[0]).filter(Boolean)));
  }, [me.seller.id]);
  useEffect(() => { load().catch((e) => setMsg(String(e.message ?? e))); }, [load]);

  const shown = (rows ?? []).filter((r) => filter === 'all' || r.listing_status === filter);
  const stock = async (r: Listing, v: string) => {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    if (n === r.stock) return;
    try { await setStock(r.id, n); setMsg(t('sdStockSaved')); load(); } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <Screen chrome="none" style={{ maxWidth: 1100 }}>
      <Seo title="My products | Seller | Al Mukarramah" description="Seller products." path="/seller/products" noindex />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <Serif role="h1" size={wide ? 40 : 30}>{t('sdProducts')}</Serif>
        <Button label={t('sdAddProduct')} href="/seller/product" disabled={me.seller.status !== 'approved'} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {(['all', 'approved', 'pending_review', 'draft', 'rejected'] as Filter[]).map((f) => (
          <Chip key={f} size="sm" label={f === 'all' ? t('all') : t(`listing_${f}` as Key)} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>
      {msg && <Notice text={msg} />}
      {rows && !rows.length && <T color={colors.muted}>{t('sdNoProducts')}</T>}
      <View style={{ gap: 10 }}>
        {shown.map((r) => (
          <View key={r.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 10 }}>
            <Pressable onPress={() => router.push({ pathname: '/seller/product', params: { id: r.id } })} style={{ width: wide ? 76 : 60 }}>
              <Photo uri={urls[r.images[0]]} ratio={1} tone={colors.sandSoft} style={{ borderRadius: 10 }} />
            </Pressable>
            <View style={{ flex: 1, gap: 4 }}>
              <Pressable onPress={() => router.push({ pathname: '/seller/product', params: { id: r.id } })}>
                <T w={700} size={14.5} numberOfLines={2}>{lang === 'ar' && r.name_ar ? r.name_ar : r.name_en}</T>
              </Pressable>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <Tag label={t(`listing_${r.listing_status}` as Key)} tone={LISTING_TONE[r.listing_status]} />
                {r.ai_check ? <Tag label={t(`ai_${r.ai_check.verdict}` as Key)} tone={r.ai_check.verdict === 'block' ? 'err' : r.ai_check.verdict === 'pass' ? 'ok' : 'warn'} /> : null}
                {r.made_to_measure ? <Tag label={t('madeToMeasure')} tone="info" /> : null}
                <T size={13} color={colors.navy} w={700}>{formatMoney(r.base_price_sar, 'SAR', lang)}</T>
              </View>
              {r.listing_status === 'rejected' && r.review_note ? <T size={12.5} color={colors.danger}>{r.review_note}</T> : null}
            </View>
            <View style={{ alignItems: 'center', gap: 4 }}>
              <T size={11.5} color={colors.muted}>{t('sdStock')}</T>
              <TextInput defaultValue={String(r.stock)} keyboardType="number-pad" accessibilityLabel={t('sdStock')}
                onEndEditing={(e) => stock(r, e.nativeEvent.text)}
                onBlur={(e) => { const v = (e.target as unknown as { value?: string }).value; if (v !== undefined) stock(r, v); }}
                style={{ width: 64, minHeight: 40, borderWidth: 1, borderColor: colors.inputLine, borderRadius: 10, textAlign: 'center', backgroundColor: colors.white }} />
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}
