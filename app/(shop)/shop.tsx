// Listing: a serif head, a toolbar between hairlines, quiet filter lists (desktop) or fine chips (phones), and tiles without boxes.
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Breadcrumb, Button, CapsLink, Chip, EmptyState, Eyebrow, FilterOption, Grid, H1, Loading, ProductTile, Sheet, T, useWide } from '@/components/ui';
import { getCategories, getProducts, getTags } from '@/lib/catalogue';
import { Faq } from '@/components/faq';
import { data, reveal } from '@/components/motion';
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
  const [filtersOpen, setFiltersOpen] = useState(false);
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
        <Chip key={k} size="sm" label={k === 'all' ? t('all') : k === 'perfume_spray' ? t('fragSprays') : t('fragOils')} active={ship === k} onPress={() => setShip(k)} />
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
    setSort('rec');
    router.setParams({ tag: undefined, cat: undefined, min: undefined, max: undefined });
  };

  /** Desktop filter group: caps heading, then rows with a small square that takes a green tick. */
  const group = (title: string, body: React.ReactNode, first?: boolean) => (
    <View style={{ gap: 6, paddingVertical: 22, borderTopWidth: first ? 0 : 1, borderColor: colors.line }}>
      <T w={600} size={10.5} caps color={colors.navy} style={{ marginBottom: 6 }}>{title}</T>
      {body}
    </View>
  );
  const tagOptions = (list: Tag[]) => (
    <>
      <FilterOption label={t('all')} active={!list.some((g) => g.slug === tag)} onPress={() => list.some((g) => g.slug === tag) && setTag(undefined)} />
      {list.map((g) => <FilterOption key={g.id} label={pick(g, 'name')} active={tag === g.slug} onPress={() => setTag(tag === g.slug ? undefined : g.slug)} />)}
    </>
  );
  const bandOptions = BANDS.map((b) => <FilterOption key={b.join('-')} label={bandLabel(b)} active={band[0] === b[0] && band[1] === b[1]} onPress={() => setBand(b)} />);
  const shipOptions = (['all', 'perfume_spray', 'perfume_oil'] as Ship[]).map((k) => (
    <FilterOption key={k} label={k === 'all' ? t('all') : k === 'perfume_spray' ? t('fragSprays') : t('fragOils')} active={ship === k} onPress={() => setShip(k)} />
  ));
  const oosToggle = <FilterOption label={t('hideOOS')} active={hideOos} onPress={() => setHideOos(!hideOos)} />;
  /** Sort: three quiet words; the chosen one in ink with a gold underline. */
  const sortControl = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? 20 : 16, flexWrap: 'wrap' }}>
      <T w={600} size={10.5} caps color={colors.muted}>{t('sortBy')}</T>
      {(['rec', 'low', 'high'] as Sort[]).map((s) => (
        <Pressable key={s} accessibilityRole="radio" accessibilityState={{ checked: sort === s }} onPress={() => setSort(s)} {...data({ foot: 1 })}
          style={{ paddingVertical: 6, borderBottomWidth: 1, borderColor: sort === s ? colors.gold : 'transparent' }}>
          <T w={sort === s ? 500 : 400} size={13} color={sort === s ? colors.navy : colors.muted}>{t(s === 'rec' ? 'sortRec' : s === 'low' ? 'sortLow' : 'sortHigh')}</T>
        </Pressable>
      ))}
    </View>
  );

  const activeCount = (tag ? 1 : 0) + (cat && !fixedCat ? 1 : 0) + (band[0] || band[1] ? 1 : 0) + (hideOos ? 1 : 0) + (ship !== 'all' ? 1 : 0) + (sort !== 'rec' ? 1 : 0);
  /** Phones: every filter and the sort in one sheet, the same quiet lists as the desktop sidebar. */
  const filterSheet = (
    <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title={t('filterSort')}>
      <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: 8 }}>
        {group(t('sortBy'), (['rec', 'low', 'high'] as Sort[]).map((k) => (
          <FilterOption key={k} label={t(k === 'rec' ? 'sortRec' : k === 'low' ? 'sortLow' : 'sortHigh')} active={sort === k} onPress={() => setSort(k)} />
        )), true)}
        {frag ? (hasSprays ? group(t('fragType'), shipOptions) : null) : (
          <>
            {occasions.length > 0 && group(t('occasion'), tagOptions(occasions))}
            {recipients.length > 0 && group(t('recipient'), tagOptions(recipients))}
          </>
        )}
        {group(t('price'), bandOptions)}
        {group(t('availability'), oosToggle)}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', borderTopWidth: 1, borderColor: colors.line, paddingTop: 16 }}>
        <Button label={t('clearFilters')} kind="quiet" onPress={clear} />
        <Button label={`${t('showResults')} · ${shown.length}`} onPress={() => setFiltersOpen(false)} style={{ flex: 1 }} />
      </View>
    </Sheet>
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
      {/* Listing head: a gold-led kicker, the serif title and its line */}
      <View style={{ gap: wide ? 14 : 10, paddingTop: wide ? 8 : 0, paddingBottom: wide ? 40 : 24, maxWidth: 780 }}>
        <Eyebrow rule>{frag ? t('fragKicker') : activeTag ? t('occasion') : t('shopKicker')}</Eyebrow>
        <H1 size={wide ? 56 : 36}>{title}</H1>
        <T size={wide ? 16 : 14.5} lh={1.65} color={colors.body}>{blurb || t('listingBody')}</T>
        {frag && <T size={13} lh={1.6} color={colors.muted}>{t('fragShipNote')}</T>}
        {frag && fragSiblings.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 24, marginTop: 6 }}>
            {fragSiblings.map((c) => <CapsLink key={c.id} label={pick(c, 'name')} href={{ pathname: '/collections/[slug]', params: { slug: c.slug } }} />)}
          </View>
        )}
      </View>

      {/* Toolbar between hairlines: the count, and the sort on the far side */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, paddingVertical: wide ? 10 : 6, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, marginBottom: wide ? 40 : 18 }}>
        <T size={13} color={colors.muted}><T w={500} size={13} num color={colors.navy}>{shown.length}</T> {t('products')}</T>
        {wide ? sortControl : (
          <Pressable accessibilityRole="button" onPress={() => setFiltersOpen(true)} {...data({ caps: 1 })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, paddingHorizontal: 2 }}>
            <Icon name="filter" size={16} stroke={1.3} color={colors.navy} />
            <T w={600} size={11} caps color={colors.navy}>{t('filterSort')}{activeCount ? ` · ${activeCount}` : ''}</T>
          </Pressable>
        )}
      </View>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 56 : 14, alignItems: 'flex-start' }}>
        {wide ? (
          <View accessibilityLabel={t('filters')} style={{ width: 232 }}>
            {categories.length > 0 && !fixedCat && group(t('categoriesTitle'), (
              <>
                <FilterOption label={t('all')} active={!cat} onPress={() => setCat(undefined)} />
                {categories.map((c) => <FilterOption key={c.id} label={pick(c, 'name')} active={cat === c.slug} onPress={() => setCat(cat === c.slug ? undefined : c.slug)} />)}
              </>
            ), true)}
            {frag ? (
              hasSprays && group(t('fragType'), shipOptions, !!fixedCat)
            ) : (
              <>
                {occasions.length > 0 && group(t('occasion'), tagOptions(occasions), !!fixedCat)}
                {recipients.length > 0 && group(t('recipient'), tagOptions(recipients))}
              </>
            )}
            {group(t('price'), bandOptions, !!fixedCat && frag && !hasSprays)}
            {group(t('availability'), oosToggle)}
          </View>
        ) : (
          <View style={{ alignSelf: 'stretch' }}>
            {categories.length > 0 && !fixedCat && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginBottom: 8 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
                {categories.map((c) => <Chip key={c.id} size="sm" label={pick(c, 'name')} active={cat === c.slug} onPress={() => setCat(cat === c.slug ? undefined : c.slug)} />)}
              </ScrollView>
            )}
            {frag && hasSprays && <View style={{ marginBottom: 8 }}>{shipChips}</View>}
          </View>
        )}

        <View style={{ flex: 1, alignSelf: 'stretch' }}>
          {products === null ? <Loading /> : shown.length === 0 ? (
            <EmptyState title={t('noMatchTitle')} body={t('noMatchBody')}>
              <Button label={t('clearFilters')} kind="secondary" onPress={clear} />
              <Button label={t('helpChoose')} href="/concierge" kind="quiet" />
            </EmptyState>
          ) : (
            <Grid gap={wide ? 28 : 14} rowGap={wide ? 56 : 32} cols={wide ? 3 : 2} reveal>
              {shown.map((p) => <ProductTile key={p.id} product={p} compact={!wide} />)}
            </Grid>
          )}
        </View>
      </View>
      {fixedCat && (
        <View {...reveal(0)} style={{ marginTop: wide ? 96 : 48, paddingTop: wide ? 0 : 0 }}>
          <Faq title={t('faqTitle')} kicker={t('faqKicker')} split={wide} items={[2, 3, 4].map((n) => ({ q: t(`hfaq${n}q` as Key), a: t(`hfaq${n}a` as Key) }))} />
        </View>
      )}
      {!wide && filterSheet}
    </Screen>
  );
}
