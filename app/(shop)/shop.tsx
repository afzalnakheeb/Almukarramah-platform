// Listing — follows Listing.dc.html / MListing.dc.html.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Breadcrumb, Button, Card, Chip, Grid, H1, Loading, ProductTile, Serif, T, useWide } from '@/components/ui';
import { getProducts, getTags } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import { convertFromSar, formatWhole, priceIn } from '@/lib/money';
import type { Product, Tag } from '@/lib/types';
import { colors } from '@/theme';

type Sort = 'rec' | 'low' | 'high';
const BANDS: [number, number][] = [[0, 0], [0, 20000], [20000, 50000], [50000, 100000], [100000, 0]];

export default function Shop() {
  const wide = useWide();
  const params = useLocalSearchParams<{ tag?: string; min?: string; max?: string }>();
  const { t, pick, currency, lang } = useI18n();
  const [occasions, setOccasions] = useState<Tag[]>([]);
  const [recipients, setRecipients] = useState<Tag[]>([]);
  const [tag, setTag] = useState<string | undefined>(params.tag);
  const [band, setBand] = useState<[number, number]>([Number(params.min ?? 0), Number(params.max ?? 0)]);
  const [sort, setSort] = useState<Sort>('rec');
  const [hideOos, setHideOos] = useState(false);
  const [products, setProducts] = useState<Product[] | null>(null);

  useEffect(() => setTag(params.tag), [params.tag]);
  useEffect(() => setBand([Number(params.min ?? 0), Number(params.max ?? 0)]), [params.min, params.max]);
  useEffect(() => {
    getTags('occasion').then(setOccasions).catch(() => undefined);
    getTags('recipient').then(setRecipients).catch(() => undefined);
  }, []);
  useEffect(() => {
    setProducts(null);
    getProducts({ tag, minSar: band[0] || undefined, maxSar: band[1] || undefined }).then(setProducts).catch(() => setProducts([]));
  }, [tag, band[0], band[1]]);

  const shown = useMemo(() => {
    let rows = products ?? [];
    if (hideOos) rows = rows.filter((p) => p.stock > 0);
    if (sort !== 'rec') rows = [...rows].sort((a, b) => (priceIn(a, currency) - priceIn(b, currency)) * (sort === 'low' ? 1 : -1));
    return rows;
  }, [products, hideOos, sort, currency]);

  const activeTag = [...occasions, ...recipients].find((g) => g.slug === tag);
  const title = activeTag ? pick(activeTag, 'name') : t('allGifts');
  const f = (v: number) => formatWhole(convertFromSar(v, currency), currency, lang);
  const bandLabel = ([a, b]: [number, number]) => (!a && !b ? t('all') : !a ? `${t('under')} ${f(b)}` : !b ? `${f(a)}+` : `${f(a)}–${f(b)}`);
  const clear = () => {
    setTag(undefined);
    setBand([0, 0]);
    setHideOos(false);
    router.setParams({ tag: undefined, min: undefined, max: undefined });
  };

  const chips = (list: Tag[]) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Chip label={t('all')} active={!list.some((g) => g.slug === tag)} onPress={() => list.some((g) => g.slug === tag) && setTag(undefined)} />
      {list.map((g) => <Chip key={g.id} label={pick(g, 'name')} active={tag === g.slug} onPress={() => setTag(tag === g.slug ? undefined : g.slug)} />)}
    </View>
  );
  const bandChips = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {BANDS.map((b) => <Chip key={b.join('-')} label={bandLabel(b)} active={band[0] === b[0] && band[1] === b[1]} onPress={() => setBand(b)} />)}
    </View>
  );
  const oosToggle = (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: hideOos }} onPress={() => setHideOos(!hideOos)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 40 }}>
      <View style={{ width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: colors.navy, backgroundColor: hideOos ? colors.navy : colors.white, alignItems: 'center', justifyContent: 'center' }}>
        {hideOos && <Icon name="check" size={16} color={colors.white} stroke={2.4} />}
      </View>
      <T size={14}>{t('hideOOS')}</T>
    </Pressable>
  );
  const sortControl = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <T w={600} size={14}>{t('sortBy')}</T>
      {(['rec', 'low', 'high'] as Sort[]).map((s) => (
        <Chip key={s} size="sm" label={t(s === 'rec' ? 'sortRec' : s === 'low' ? 'sortLow' : 'sortHigh')} active={sort === s} onPress={() => setSort(s)} />
      ))}
    </View>
  );

  return (
    <Screen>
      <Breadcrumb items={[{ label: t('home'), href: '/' }, { label: t('shop'), href: activeTag ? '/shop' : undefined }, ...(activeTag ? [{ label: title }] : [])]} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 22 }}>
        <View style={{ maxWidth: 700 }}>
          <H1>{title}</H1>
          <T size={16} lh={1.6} color={colors.body}>{t('listingBody')}</T>
        </View>
        {wide && sortControl}
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 32 : 14, alignItems: 'flex-start' }}>
        {wide ? (
          <View accessibilityLabel={t('filters')} style={{ width: 280, gap: 14 }}>
            <Card pad={16} style={{ gap: 10 }}><T w={700} size={14}>{t('occasion')}</T>{chips(occasions)}</Card>
            <Card pad={16} style={{ gap: 10 }}><T w={700} size={14}>{t('recipient')}</T>{chips(recipients)}</Card>
            <Card pad={16} style={{ gap: 10 }}><T w={700} size={14}>{t('price')}</T>{bandChips}</Card>
            <Card pad={16}>{oosToggle}</Card>
          </View>
        ) : (
          <View style={{ gap: 10, alignSelf: 'stretch' }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {[...occasions, ...recipients].map((g) => <Chip key={g.id} label={pick(g, 'name')} active={tag === g.slug} onPress={() => setTag(tag === g.slug ? undefined : g.slug)} />)}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {BANDS.slice(1).map((b) => <Chip key={b.join('-')} label={bandLabel(b)} active={band[0] === b[0] && band[1] === b[1]} onPress={() => setBand(band[0] === b[0] && band[1] === b[1] ? [0, 0] : b)} />)}
            </ScrollView>
            {sortControl}
          </View>
        )}

        <View style={{ flex: 1, alignSelf: 'stretch', gap: 16 }}>
          {products === null ? <Loading /> : (
            <>
              <T size={14} color={colors.muted}><T w={700} size={14}>{shown.length}</T> {t('products')}</T>
              {shown.length === 0 ? (
                <View style={{ backgroundColor: colors.white, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CFC5B3', borderRadius: 20, padding: 36, alignItems: 'center', gap: 10 }}>
                  <Serif size={28} center>{t('noMatchTitle')}</Serif>
                  <T color={colors.muted} center>{t('noMatchBody')}</T>
                  <Button label={t('clearFilters')} onPress={clear} />
                </View>
              ) : (
                <Grid gap={wide ? 22 : 12} cols={wide ? 3 : 2}>
                  {shown.map((p) => <ProductTile key={p.id} product={p} compact={!wide} />)}
                </Grid>
              )}
            </>
          )}
        </View>
      </View>
    </Screen>
  );
}
