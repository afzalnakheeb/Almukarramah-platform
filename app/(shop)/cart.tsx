import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { Button, Chip, H1, Notice, Screen } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { useI18n } from '@/lib/i18n';
import { convertFromSar, formatMoney } from '@/lib/money';
import { colors, radius, space, type } from '@/theme';

export default function CartScreen() {
  const { t, pick, currency, lang } = useI18n();
  const { lines, setQty, subtotalSar } = useCart();
  const money = (sar: number) => formatMoney(convertFromSar(sar, currency), currency, lang);

  return (
    <Screen>
      <H1>{t('cart')}</H1>
      {lines.length === 0 ? (
        <Notice text={t('bagEmpty')} />
      ) : (
        <>
          {lines.map((l) => (
            <View key={l.productId} style={{ backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space(2), marginBottom: space(1.5) }}>
              <Text style={[type.body, { fontWeight: '600' }]}>{pick(l, 'name')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space(1) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
                  <Chip label="−" onPress={() => setQty(l.productId, l.quantity - 1)} />
                  <Text style={type.body}>{l.quantity}</Text>
                  <Chip label="+" onPress={() => setQty(l.productId, l.quantity + 1)} />
                </View>
                <Text style={{ fontWeight: '700', color: colors.navy }}>{money(l.unitPriceSar * l.quantity)}</Text>
              </View>
            </View>
          ))}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: space(2) }}>
            <Text style={type.title}>{t('subtotal')}</Text>
            <Text style={type.title}>{money(subtotalSar)}</Text>
          </View>
          <Text style={type.small}>{t('vatIncluded')}</Text>
          <Button label={t('checkout')} style={{ marginTop: space(3) }} onPress={() => router.push('/checkout')} />
        </>
      )}
    </Screen>
  );
}
