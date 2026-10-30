// Bag (step 1 of checkout): lines between hairlines, a porcelain summary, a quiet gift message.
import { Link, router } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { destIcon, Screen } from '@/components/chrome';
import { data } from '@/components/motion';
import { Button, Divider, EmptyState, Eyebrow, Field, H1, Photo, Row, Serif, Stepper, T, Tag, useWide } from '@/components/ui';
import { Icon } from '@/components/icons';
import { useCart } from '@/lib/cart';
import { useI18n, type Key } from '@/lib/i18n';
import { convertFromSar, formatMoney } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';
import { useSession } from '@/lib/session';
import { colors, toneFor } from '@/theme';
import { Seo } from '@/components/seo';
import { AskAssistant } from '@/components/assistant';

export default function CartScreen() {
  const wide = useWide();
  const { t, pick, currency, lang } = useI18n();
  const { session } = useSession();
  const { destination } = usePrefs();
  const { lines, setQty, subtotalSar, giftMessage, setGiftMessage } = useCart();
  const money = (sar: number) => formatMoney(convertFromSar(sar, currency), currency, lang);

  if (lines.length === 0) {
    return (
      <Screen chrome="checkout" step={1}>
        <Seo title="Your bag | Al Mukarramah" description="Your Al Mukarramah gift bag." path="/cart" noindex />
        <EmptyState h1 title={t('bagEmpty')} body={t('bagEmptyBody')}>
          <Button label={t('exploreGifts')} href="/shop" />
          <Button label={t('helpChoose')} href="/concierge" kind="quiet" />
        </EmptyState>
        <View style={{ flexDirection: wide ? 'row' : 'column', justifyContent: 'center', gap: wide ? 48 : 0, borderTopWidth: 1, borderColor: colors.goldLine, paddingTop: wide ? 36 : 12, maxWidth: 860, width: '100%', alignSelf: 'center' }}>
          {([['navPerfumeOud', 'perfumes'], ['navPrayer', 'prayer-mats'], ['navGifts', 'gift-sets'], ['navDates', 'dates']] as [Key, string][]).map(([k, slug]) => (
            <Link key={k} href={{ pathname: '/collections/[slug]', params: { slug } }} style={{ paddingVertical: wide ? 4 : 14, borderBottomWidth: wide ? 0 : 1, borderColor: colors.line }}>
              <T w={500} size={11.5} caps color={colors.navy} center={wide}>{t(k)}</T>
            </Link>
          ))}
        </View>
      </Screen>
    );
  }

  const summary = (
    <View style={{ backgroundColor: colors.porcelain, borderWidth: 1, borderColor: colors.line, borderTopColor: colors.gold, padding: wide ? 28 : 20, gap: 12 }}>
      <Serif size={wide ? 28 : 24}>{t('summary')}</Serif>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}>
        <Icon name={destIcon(destination)} size={18} stroke={1.3} color={colors.emerald} />
        <View style={{ flex: 1 }}>
          <T size={11.5} color={colors.muted}>{t('deliveringTo')}</T>
          <T w={500} size={14} color={colors.navy}>{t(`destTitle_${destination}` as Key)}</T>
        </View>
      </View>
      <Row label={t('items')} value={money(subtotalSar)} />
      <Row label={t('shipping')} value={t('deliveryNext')} color={colors.muted} />
      <Divider gold style={{ marginVertical: 4 }} />
      <Row label={t('subtotal')} value={money(subtotalSar)} bold />
      <T size={12} color={colors.muted}>{t('vatIncluded')}</T>
      <Button label={session ? t('continueCheckout') : t('checkoutGuest')} size="lg" full onPress={() => router.push('/checkout')} style={{ marginTop: 8 }} />
      {!session && (
        <View style={{ alignItems: 'center', gap: 6, marginTop: 4 }}>
          <Button kind="text" size="sm" label={t('signInFaster')} href="/account" />
          <T size={12} color={colors.muted} center>{t('noAccountNeeded')}</T>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}>
        <Icon name="lock" size={13} stroke={1.4} color={colors.emerald} />
        <T size={11.5} color={colors.muted}>{t('payNote')}</T>
      </View>
    </View>
  );

  return (
    <Screen chrome="checkout" step={1}>
      <Seo title="Your bag | Al Mukarramah" description="Your Al Mukarramah gift bag." path="/cart" noindex />
      <View style={{ gap: 10, marginBottom: wide ? 32 : 20 }}>
        <Eyebrow rule>{t('checkout')}</Eyebrow>
        <H1 size={wide ? 52 : 36}>{t('yourBag')}</H1>
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 64 : 28, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, alignSelf: 'stretch' }}>
          <View style={{ borderTopWidth: 1, borderColor: colors.goldLine }}>
            {lines.map((l) => (
              <View key={l.productId} style={{ flexDirection: 'row', gap: wide ? 24 : 16, paddingVertical: wide ? 24 : 18, borderBottomWidth: 1, borderColor: colors.line }}>
                <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: l.slug } })} style={{ width: wide ? 112 : 84 }}>
                  <Photo uri={l.image} ratio={4 / 5} tone={l.image ? colors.sand : toneFor(l.slug)} fit="cover" />
                </Pressable>
                <View style={{ flex: 1, gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }}>
                    <Serif size={wide ? 22 : 18} style={{ flex: 1 }}>{pick(l, 'name')}</Serif>
                    <T w={500} size={wide ? 15 : 14} num color={colors.navy}>{money(l.unitPriceSar * l.quantity)}</T>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 5, height: 5, borderRadius: 999, backgroundColor: colors.emerald }} />
                    <T size={12.5} color={colors.body}>{t('inStock')}</T>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginTop: 'auto', paddingTop: 6, flexWrap: 'wrap' }}>
                    <Stepper value={l.quantity} min={1} onChange={(n) => setQty(l.productId, n)} />
                    <Pressable accessibilityRole="button" onPress={() => setQty(l.productId, 0)} {...data({ foot: 1 })}>
                      <T w={500} size={10.5} caps color={colors.muted} style={{ textDecorationLine: 'underline' }}>{t('remove')}</T>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))}
          </View>

          <View style={{ marginTop: wide ? 40 : 28, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Serif role="h2" size={wide ? 30 : 24}>{t('gifting')}</Serif>
              <Tag label={t('optional')} />
            </View>
            <Field label={t('giftMessage')} hint={`${t('giftMessageHint')} · ${giftMessage.length}/200`} value={giftMessage} onChangeText={(v) => setGiftMessage(v.slice(0, 200))} multiline maxLength={200} />
            <AskAssistant label={t('writeForMe')} />
          </View>
        </View>
        <View style={{ width: wide ? 400 : '100%' }}>{summary}</View>
      </View>
    </Screen>
  );
}
