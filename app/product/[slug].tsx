import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Loading, Notice, Price, Screen } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { getProduct } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import type { Product } from '@/lib/types';
import { colors, radius, space, type } from '@/theme';

export default function ProductScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, pick } = useI18n();
  const { add } = useCart();
  const [product, setProduct] = useState<Product | null | undefined>(undefined);

  useEffect(() => {
    getProduct(slug).then(setProduct).catch(() => setProduct(null));
  }, [slug]);

  if (product === undefined) return <Screen><Loading /></Screen>;
  if (product === null) return <Screen><Notice text="—" /></Screen>;

  const soldOut = product.stock <= 0;
  return (
    <Screen>
      <Stack.Screen options={{ title: pick(product, 'name') }} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
        <Image
          source={product.images[0] ? { uri: product.images[0] } : require('../../assets/logo.png')}
          style={{ width: '100%', maxWidth: 480, aspectRatio: 1, borderRadius: radius.lg, backgroundColor: colors.sand }}
          contentFit={product.images[0] ? 'cover' : 'contain'}
        />
        <View style={{ flex: 1, minWidth: 280 }}>
          <Text style={type.display}>{pick(product, 'name')}</Text>
          <Price product={product} style={{ fontSize: 22, marginVertical: space(1) }} />
          <Text style={type.small}>{t('vatIncluded')}</Text>
          <Text style={[type.body, { marginTop: space(2) }]}>{pick(product, 'description')}</Text>
          {product.restricted_countries.length > 0 && (
            <Notice text={`${t('notToCountry')}: ${product.restricted_countries.join(', ')}`} />
          )}
          <Button
            label={soldOut ? t('outOfStock') : t('addToBag')}
            disabled={soldOut}
            style={{ marginTop: space(3) }}
            onPress={() => {
              add(product);
              router.push('/cart');
            }}
          />
        </View>
      </View>
    </Screen>
  );
}
