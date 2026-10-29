// Listing — follows Listing.dc.html / MListing.dc.html.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Glow, Ornament, StarLattice } from '@/components/decor';
import { Icon } from '@/components/icons';
import { Breadcrumb, Button, Card, Chip, Eyebrow, Grid, H1, Loading, ProductTile, Serif, T, useWide } from '@/components/ui';
import { getCategories, getProducts, getTags } from '@/lib/catalogue';
import { Faq } from '@/components/faq';
import { breadcrumbLd, faqLd, itemListLd, Seo } from '@/components/seo';
import { strings, useI18n, type Key } from '@/lib/i18n';
import { SITE_URL } from '@/lib/images';
import { snapshot } from '@/lib/snapshot';
import { convertFromSar, formatWhole, priceIn } from '@/lib/money';
import type { Category, Product, Tag } from '@/lib/types';
import { colors } from '@/theme';

type Sort = 'rec' | 'low' | 'high';
type Ship = 'all' | 'perfume_spray' | 'perfume_oil';
/** Fragrance collections get their own header and a spray/oil filter instead of occasion and recipient. */
const FRAGRANCE = ['perfumes', 'oud-oils', 'bakhoor'];
const BANDS: [number, number][] = [[0, 0], [0, 20000], [20000, 50000], [50000, 100000], [100000, 0]];

export default function Shop() {
  return <ShopView />;
}

function filterSnapshot(f: { tag?: string; category?: string; minSar?: number; maxSar?: number }): Product[] {
  return snapshot.products.filter((p) =>
    (!f.category || p.categories?.slug === f.category) &&
    (!f.tag || p.product_tags?.some((pt) => pt.tags.slug === f.tag)) &&
    (!f.minSar || p.base_price_sar >= f.minSar) &&
    (!f.maxSar || p.base_price_sar < f.maxSar));
}

/** The listing. Collections pass a fixed category; the shop reads filters from the address. */
export function ShopView({ fixedCat }: { fixedCat?: string }) {
  const wide = useWide();
  const params = useLocalSearchParams<{ tag?: string; cat?: string; min?: string; max?: string; q?: string }>();
  const { t, pick, currency, lang } = useI18n();
  const [occasions, setOccasions] = useState<Tag[]>([]);
  const [recipients, setRecipients] = useState<Tag[]>([]);
  const [tag, setTag] = useState<string | undefined>(params.tag);
  const [cat, setCat] = useState<string | undefined>(fixedCat ?? params.cat);
  const [categories, setCategories] = useState<Category[]>(snapshot.categories);
  const q = (params.q ?? '').trim().toLowerCase();
  const [band, setBand] = useState<[number, number]>([Number(params.min ?? 0), Number(params.max ?? 0)]);
  const [sort, setSort] = useState<Sort>('rec');
  const [hideOos, setHideOos] = useState(false);
  const [ship, setShip] = useState<Ship>('all');
  const [products, setProducts] = useState<Product[] | null>(() =>
    filterSnapshot({ tag: params.tag, category: fixedCat ?? params.cat, minSar: Number(params.min ?? 0) || undefined, maxSar: Number(params.max ?? 0) || undefined }));

  useEffect(() => setTag(params.tag), [params.tag]);
  useEffect(() => setCat(fixedCat ?? params.cat), [params.cat, fixedCat]);
  useEffect(() => setBand([Number(params.min ?? 0), Number(params.max ?? 0)]), [params.min, params.max]);
  useEffect(() => {
    getTags('occasion').then(setOccasions).catch(() => undefined);
    getTags('recipient').then(setRecipients).catch(() => undefined);
    getCategories().then((c) => c.length && setCategories(c)).catch(() => undefined);
  }, []);
  useEffect(() => {
    getProducts({ tag, category: cat, minSar: band[0] || undefined, maxSar: band[1] || undefined }).then(setProducts).catch(() => setProducts((cur) => cur ?? []));
  }, [tag, cat, band[0], band[1]]);

  const shown = useMemo(() => {
    let rows = products ?? [];
    if (q) rows = rows.filter((p) => [p.name_en, p.name_ar, p.description_en, p.description_ar, p.categories?.name_en].some((v) => v?.toLowerCase().includes(q)));
    if (hideOos) rows = rows.filter((p) => p.stock > 0);
    if (ship === 'perfume_spray') rows = rows.filter((p) => p.ship_class === 'perfume_spray');
    if (ship === 'perfume_oil') rows = rows.filter((p) => p.ship_class !== 'perfume_spray');
    if (sort !== 'rec') rows = [...rows].sort((a, b) => (priceIn(a, currency) - priceIn(b, currency)) * (sort === 'low' ? 1 : -1));
    return rows;
  }, [products, hideOos, sort, currency, q, ship]);

  const activeTag = [...occasions, ...recipients].find((g) => g.slug === tag);
  const activeCat = categories.find((c) => c.slug === cat);
  const title = activeCat ? pick(activeCat, 'name') : activeTag ? pick(activeTag, 'name') : q ? `${t('searchResults')} “${params.q}”` : t('allGifts');
  const blurb = activeCat ? pick(activeCat, 'blurb') : '';
  const frag = !!cat && FRAGRANCE.includes(cat);
  const fragSiblings = categories.filter((c) => FRAGRANCE.includes(c.slug) && c.slug !== cat);
  const hasSprays = (products ?? []).some((p) => p.ship_class === 'perfume_spray');
  const shipChips = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {(['all', 'perfume_spray', 'perfume_oil'] as Ship[]).map((k) => (
        <Chip key={k} size={wide ? 'md' : 'sm'} label={k === 'all' ? t('all') : k === 'perfume_spray' ? t('fragSprays') : t('fragOils')} active={ship === k} onPress={() => setShip(k)} />
      ))}
    </View>
  );
  const f = (v: number) => formatWhole(convertFromSar(v, currency), currency, lang);
  const bandLabel = ([a, b]: [number, number]) => (!a && !b ? t('all') : !a ? `${t('under')} ${f(b)}` : !b ? `${f(a)}+` : `${f(a)}–${f(b)}`);
  const clear = () => {
    setTag(undefined);
    setCat(fixedCat);
    setBand([0, 0]);
    setHideOos(false);
    setShip('all');
    router.setParams({ tag: undefined, cat: undefined, min: undefined, max: undefined });
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

  const seoPath = fixedCat ? `/collections/${fixedCat}` : '/shop';
  const seoTitle = activeCat ? `${activeCat.name_en} | Al Mukarramah` : 'All gifts | Al Mukarramah — Islamic gifts from Madinah';
  const seoDesc = activeCat?.blurb_en ?? 'Prayer mats, woven prayer rugs, gift sets, Madinah dates, keepsakes and Ahmed Al Maghribi perfumes, from Madinah. Prices include VAT; delivery to Madinah and Makkah hotels and worldwide.';
  return (
    <Screen>
      <Seo
        title={seoTitle}
        description={seoDesc}
        path={seoPath}
        image={activeCat?.image ?? shown[0]?.images[0]}
        noindex={!fixedCat && Boolean(params.tag || params.cat || params.min || params.max || params.q)}
        jsonLd={[
          { '@context': 'https://schema.org', '@type': 'CollectionPage', name: activeCat?.name_en ?? 'All gifts', description: seoDesc, url: `${SITE_URL}${seoPath}` },
          itemListLd(activeCat?.name_en ?? 'All gifts', shown),
          breadcrumbLd([{ name: 'Home', path: '/' }, { name: activeCat?.name_en ?? 'Shop', path: seoPath }]),
          ...(fixedCat ? [faqLd([2, 3, 4].map((n) => ({ q: strings.en[`hfaq${n}q` as Key], a: strings.en[`hfaq${n}a` as Key] })))] : []),
        ]}
      />
      <Breadcrumb items={[{ label: t('home'), href: '/' }, { label: t('shop'), href: activeTag || activeCat ? '/shop' : undefined }, ...(activeTag || activeCat ? [{ label: title }] : [])]} />
      {frag ? (
        <View style={{ backgroundColor: colors.night, borderRadius: wide ? 26 : 20, overflow: 'hidden', borderWidth: 1, borderColor: colors.gold, marginBottom: 22 }}>
          <StarLattice opacity={0.08} size={60} />
          <Glow cx="85%" cy="0%" r="60%" opacity={0.2} />
          <View style={{ padding: wide ? 36 : 18, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 28, height: 1, backgroundColor: colors.gold }} />
              <Eyebrow size={wide ? 13 : 11} color={colors.gold}>{t('fragKicker')}</Eyebrow>
            </View>
            <Serif role="h1" size={wide ? 52 : 34} color={colors.white}>{title}</Serif>
            <Ornament width={90} />
            <T size={wide ? 16 : 14} lh={1.6} color={colors.onNight} style={{ maxWidth: 760 }}>{blurb}</T>
            <T size={13} color={colors.champagne} style={{ maxWidth: 760 }}>{t('fragShipNote')}</T>
            {fragSiblings.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                {fragSiblings.map((c) => (
                  <Button key={c.id} size="sm" kind="outlineLight" label={pick(c, 'name')} href={{ pathname: '/collections/[slug]', params: { slug: c.slug } }} />
                ))}
              </View>
            )}
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: frag ? 'flex-end' : 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 22 }}>
        {!frag && (
          <View style={{ maxWidth: 700 }}>
            <H1>{title}</H1>
            <T size={16} lh={1.6} color={colors.body}>{blurb || t('listingBody')}</T>
          </View>
        )}
        {wide && sortControl}
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 32 : 14, alignItems: 'flex-start' }}>
        {wide ? (
          <View accessibilityLabel={t('filters')} style={{ width: 280, gap: 14 }}>
            {categories.length > 0 && !fixedCat && (
              <Card pad={16} style={{ gap: 10 }}>
                <T w={700} size={14}>{t('categoriesTitle')}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Chip label={t('all')} active={!cat} onPress={() => setCat(undefined)} />
                  {categories.map((c) => <Chip key={c.id} label={pick(c, 'name')} active={cat === c.slug} onPress={() => setCat(cat === c.slug ? undefined : c.slug)} />)}
                </View>
              </Card>
            )}
            {frag ? (
              hasSprays && <Card pad={16} style={{ gap: 10 }}><T w={700} size={14}>{t('fragType')}</T>{shipChips}</Card>
            ) : (
              <>
                <Card pad={16} style={{ gap: 10 }}><T w={700} size={14}>{t('occasion')}</T>{chips(occasions)}</Card>
                <Card pad={16} style={{ gap: 10 }}><T w={700} size={14}>{t('recipient')}</T>{chips(recipients)}</Card>
              </>
            )}
            <Card pad={16} style={{ gap: 10 }}><T w={700} size={14}>{t('price')}</T>{bandChips}</Card>
            <Card pad={16}>{oosToggle}</Card>
          </View>
        ) : (
          <View style={{ gap: 10, alignSelf: 'stretch' }}>
            {categories.length > 0 && !fixedCat && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {categories.map((c) => <Chip key={c.id} label={pick(c, 'name')} active={cat === c.slug} onPress={() => setCat(cat === c.slug ? undefined : c.slug)} />)}
              </ScrollView>
            )}
            {frag && hasSprays && shipChips}
            {!frag && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {[...occasions, ...recipients].map((g) => <Chip key={g.id} label={pick(g, 'name')} active={tag === g.slug} onPress={() => setTag(tag === g.slug ? undefined : g.slug)} />)}
            </ScrollView>}
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
      {fixedCat && (
        <View style={{ marginTop: 48, maxWidth: 860 }}>
          <Faq title={t('faqTitle')} items={[2, 3, 4].map((n) => ({ q: t(`hfaq${n}q` as Key), a: t(`hfaq${n}a` as Key) }))} />
        </View>
      )}
    </Screen>
  );
}
