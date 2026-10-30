// Reviews on a product page: verified purchases only, read by our team before they appear, with the seller's reply.
// Loaded after the page is live (the page itself is pre-rendered without them).
import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Stars } from '@/components/aftersale';
import { Chip, T, useHydrated, useWide } from '@/components/ui';
import { productReviews, type ProductReviews } from '@/lib/aftersale';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

/** The product's published reviews, or `empty` when there are none (or before switch-on). */
export function ReviewsSection({ productId, slug, empty }: { productId: string; slug?: string; empty: React.ReactNode }) {
  const { t, lang } = useI18n();
  const wide = useWide();
  const hydrated = useHydrated();
  const [data, setData] = useState<ProductReviews | null>(null);
  const [sort, setSort] = useState<'recent' | 'highest' | 'lowest' | 'photos'>('recent');
  useEffect(() => { if (hydrated) productReviews(productId, sort, 6, slug).then(setData).catch(() => setData(null)); }, [hydrated, productId, sort]);
  if (!data || !data.count) return <>{empty}</>;
  const date = (s: string) => new Date(s).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <View style={{ gap: 16 }} nativeID="reviews">
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 24, alignItems: 'flex-start' }}>
        <View style={{ width: wide ? 220 : '100%', gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-end' }}>
            <T size={40} w={700} color={colors.navy} num>{Number(data.avg ?? 0).toFixed(1)}</T>
            <View style={{ paddingBottom: 8 }}><Stars value={Number(data.avg ?? 0)} size={16} /></View>
          </View>
          <T size={13} color={colors.muted}>{t('rvCount').replace('{n}', String(data.count))}</T>
          {[5, 4, 3, 2, 1].map((s) => {
            const n = data.stars[String(s)] ?? 0;
            return (
              <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <T size={12.5} num style={{ width: 22 }}>{s}★</T>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.sand }}>
                  <View style={{ width: `${data.count ? (n / data.count) * 100 : 0}%`, height: 6, borderRadius: 3, backgroundColor: colors.brass }} />
                </View>
                <T size={12} color={colors.muted} num style={{ width: 26, textAlign: 'right' }}>{n}</T>
              </View>
            );
          })}
          <T size={12} lh={1.5} color={colors.muted}>{t('rvVerifiedNote')}</T>
        </View>
        <View style={{ flex: 1, gap: 14, alignSelf: 'stretch' }}>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {(['recent', 'highest', 'lowest', 'photos'] as const).map((s) => <Chip key={s} size="sm" label={t(`rvSort_${s}`)} active={sort === s} onPress={() => setSort(s)} />)}
          </View>
          {data.reviews.map((r) => (
            <View key={r.id} style={{ gap: 6, borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 14 }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <Stars value={r.rating} />
                {r.title ? <T w={700} size={14.5}>{r.title}</T> : null}
              </View>
              <T size={12.5} color={colors.muted}>{r.author} · {date(r.published_at)} · <T size={12.5} color={colors.emerald}>{t('rvVerified')}</T>{r.variant ? ` · ${r.variant}` : ''}</T>
              {r.body ? <T size={14} lh={1.65} color={colors.body} style={{ writingDirection: r.lang === 'ar' ? 'rtl' : 'ltr' }}>{r.body}</T> : null}
              {r.photos.length ? (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {r.photos.map((u) => <Image key={u} source={{ uri: u }} style={{ width: 88, height: 88, borderRadius: 6, backgroundColor: colors.sand }} />)}
                </View>
              ) : null}
              {r.reply ? (
                <View style={{ marginTop: 4, paddingStart: 14, borderStartWidth: 2, borderColor: colors.goldLine, gap: 3 }}>
                  <T size={12.5} w={700} color={colors.brassText}>{t('rvReplyFrom').replace('{name}', lang === 'ar' ? r.reply.by_ar : r.reply.by_en)}</T>
                  <T size={13.5} lh={1.6} color={colors.body}>{r.reply.body}</T>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
