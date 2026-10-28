import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Chip, Grid, H1, Loading, ProductCard, Screen } from '@/components/ui';
import { getProducts, getTags } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import type { Product, Tag } from '@/lib/types';
import { space, type } from '@/theme';

export default function Shop() {
  const params = useLocalSearchParams<{ tag?: string; max?: string }>();
  const { t, pick } = useI18n();
  const [tags, setTags] = useState<Tag[]>([]);
  const [tag, setTag] = useState<string | undefined>(params.tag);
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => setTag(params.tag), [params.tag]);
  useEffect(() => {
    Promise.all([getTags('occasion'), getTags('recipient')]).then(([a, b]) => setTags([...a, ...b])).catch(() => undefined);
  }, []);
  useEffect(() => {
    setProducts(null);
    getProducts({ tag, maxSar: params.max ? Number(params.max) : undefined }).then(setProducts).catch(() => setProducts([]));
  }, [tag, params.max]);

  return (
    <Screen>
      <H1>{t('shop')}</H1>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1), marginBottom: space(2) }}>
        {tags.map((g) => (
          <Chip key={g.id} label={pick(g, 'name')} active={tag === g.slug} onPress={() => setTag(tag === g.slug ? undefined : g.slug)} />
        ))}
      </View>
      {products === null ? <Loading /> : products.length === 0 ? <Text style={type.body}>—</Text> : <Grid>{products.map((p) => <ProductCard key={p.id} product={p} />)}</Grid>}
    </Screen>
  );
}
