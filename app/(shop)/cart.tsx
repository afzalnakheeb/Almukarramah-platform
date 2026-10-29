// Bag — follows Cart.dc.html / MCart.dc.html (step 1 of checkout).
import { Link, router } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Button, Card, Divider, Field, H1, Photo, Row, Serif, Stepper, T, Tag, useWide } from '@/components/ui';
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
        <View style={{ alignItems: 'center', paddingVertical: 64, gap: 12 }}>
          <Serif role="h1" size={wide ? 44 : 32} center>{t('bagEmpty')}</Serif>
          <T color={colors.muted} center>{t('bagEmptyBody')}</T>
          <Button label={t('exploreGifts')} href="/shop" style={{ marginTop: 8 }} />
        </View>
      </Screen>
    );
  }

  const summary = (
    <Card pad={20} style={{ gap: 10, borderRadius: 20 }}>
      <T w={700} size={17} color={colors.navy}>{t('summary')}</T>
      <View style={{ backgroundColor: colors.ivory, borderRadius: 14, padding: 12, gap: 2 }}>
        <T size={12} color={colors.muted}>{t('deliveringTo')}</T>
        <T w={700} size={14}>{t(`destTitle_${destination}` as Key)}</T>
      </View>
      <Row label={t('items')} value={money(subtotalSar)} />
      <Row label={t('shipping')} value={t('deliveryNext')} color={colors.muted} />
      <Divider />
      <Row label={t('subtotal')} value={money(subtotalSar)} bold />
      <T size={12} color={colors.muted}>{t('vatIncluded')}</T>
      <Button label={session ? t('continueCheckout') : t('checkoutGuest')} size="lg" onPress={() => router.push('/checkout')} style={{ marginTop: 6 }} />
      {!session && (
        <>
          <Link href="/account" style={{ alignSelf: 'center', paddingVertical: 6 }}><T w={700} size={14} color={colors.navy} style={{ textDecorationLine: 'underline' }}>{t('signInFaster')}</T></Link>
          <T size={12} color={colors.muted} center>{t('noAccountNeeded')}</T>
        </>
      )}
    </Card>
  );

  return (
    <Screen chrome="checkout" step={1}>
      <Seo title="Your bag | Al Mukarramah" description="Your Al Mukarramah gift bag." path="/cart" noindex />
      <H1 size={wide ? 48 : 34}>{t('yourBag')}</H1>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 32 : 18, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, alignSelf: 'stretch', gap: 14 }}>
          {lines.map((l) => (
            <Card key={l.key ?? l.productId} pad={16} style={{ flexDirection: 'row', gap: 16, borderRadius: 20 }}>
              <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: l.slug } })} style={{ width: wide ? 120 : 84 }}>
                <Photo uri={l.image} ratio={4 / 5} tone={l.image ? colors.white : toneFor(l.slug)} fit="contain" style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.line }} />
              </Pressable>
              <View style={{ flex: 1, gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
                  <T w={700} size={wide ? 16 : 14.5} style={{ flex: 1 }}>{pick(l, 'name')}</T>
                  <T w={700} size={wide ? 16 : 14.5} color={colors.navy}>{money(l.unitPriceSar * l.quantity)}</T>
                </View>
                {l.sellerName ? <T size={12.5} color={colors.brassText} w={600}>{t('soldBy')} {l.sellerName}</T> : null}
                {l.custom?.size ? <T size={13} color={colors.body}>{t('size')}: {l.custom.size}</T> : null}
                {l.custom?.measurements ? <T size={13} color={colors.body}>{t('madeToMeasure')}{l.custom.profileName ? ` · ${l.custom.profileName}` : ''}</T> : null}
                {l.custom?.options ? <T size={12.5} color={colors.muted} numberOfLines={2}>{Object.values(l.custom.options).length} {t('designChoices')}</T> : null}
                {!l.custom ? <T size={13} color={colors.success} w={600}>{t('inStock')}</T> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 'auto', flexWrap: 'wrap' }}>
                  <Stepper value={l.quantity} min={1} onChange={(n) => setQty(l.key ?? l.productId, n)} />
                  <Pressable accessibilityRole="button" onPress={() => setQty(l.key ?? l.productId, 0)}>
                    <T w={700} size={14} color={colors.navy} style={{ textDecorationLine: 'underline' }}>{t('remove')}</T>
                  </Pressable>
                </View>
              </View>
            </Card>
          ))}

          <Card pad={wide ? 22 : 16} style={{ gap: 12, borderRadius: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Serif role="h2" size={wide ? 30 : 24}>{t('gifting')}</Serif>
              <Tag label={t('optional')} />
            </View>
            <Field label={t('giftMessage')} hint={`${t('giftMessageHint')} · ${giftMessage.length}/200`} value={giftMessage} onChangeText={(v) => setGiftMessage(v.slice(0, 200))} multiline maxLength={200} />
            <AskAssistant label={t('writeForMe')} />
          </Card>
        </View>
        <View style={{ width: wide ? 380 : '100%' }}>{summary}</View>
      </View>
    </Screen>
  );
}
