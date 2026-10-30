// Search across our own products and every approved seller's listings, in English or Arabic (diacritics and letter
// variants do not matter). Filters: department and category, seller, price, rating, made to measure and the
// category's own details (concentration, origin, size...), each with the number of results; sorting; more results
// on demand. The marketplace database does the work once it is switched on (src/lib/search.ts).
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Icon } from '@/components/icons';
import { Seo } from '@/components/seo';
import { Button, Chip, Container, EmptyState, Eyebrow, Field, FilterOption, Grid, Loading, ProductTile, Serif, Sheet, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { departments, useGuidance } from '@/lib/market';
import { convertFromSar, formatWhole } from '@/lib/money';
import { searchListings, type AttributeFacet, type SearchItem, type SearchParams, type SearchResult } from '@/lib/search';
import type { Product } from '@/lib/types';
import { colors, sans } from '@/theme';

const SORTS = ['relevance', 'featured', 'price_asc', 'price_desc', 'newest', 'rating'] as const;
const BANDS: [number, number][] = [[0, 0], [0, 20000], [20000, 50000], [50000, 100000], [100000, 0]];
const PAGE = 24;

/** The card the rest of the site uses (the price shown is the lowest option's). */
const asProduct = (x: SearchItem): Product => ({
  id: x.id, slug: x.slug, name_en: x.name_en, name_ar: x.name_ar, description_en: null, description_ar: null, brand: x.brand,
  base_price_sar: x.price_from, stock: x.stock, images: x.images, restricted_countries: [], is_featured: false, made_to_measure: x.made_to_measure,
  categories: x.category, sellers: x.seller ? { ...x.seller, country: '', kind: 'marketplace' } : null,
}) as Product;

export default function Search() {
  const wide = useWide();
  const { t, lang, currency, isRTL } = useI18n();
  const g = useGuidance();
  const params = useLocalSearchParams<{ q?: string; cat?: string; seller?: string; min?: string; max?: string; sort?: string; rating?: string; mtm?: string }>();
  const [text, setText] = useState(params.q ?? '');
  const [attrs, setAttrs] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<SearchResult | null>(null);
  const [items, setItems] = useState<SearchItem[]>([]);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  const query: SearchParams = useMemo(() => ({
    q: params.q || undefined, category: params.cat || undefined, seller: params.seller || undefined,
    min_price: params.min ? Number(params.min) : undefined, max_price: params.max ? Number(params.max) : undefined,
    rating_min: params.rating ? Number(params.rating) : undefined, made_to_measure: params.mtm === '1' ? true : undefined,
    sort: (SORTS as readonly string[]).includes(params.sort ?? '') ? (params.sort as SearchParams['sort']) : undefined,
    attributes: Object.keys(attrs).length ? attrs : undefined, page_size: PAGE,
  }), [params.q, params.cat, params.seller, params.min, params.max, params.rating, params.mtm, params.sort, attrs]);

  useEffect(() => { setText(params.q ?? ''); }, [params.q]);
  useEffect(() => { setAttrs({}); }, [params.cat]);
  useEffect(() => {
    let live = true;
    setBusy(true); setError(null); setPage(1);
    searchListings({ ...query, page: 1 }, g).then((r) => { if (live) { setResult(r); setItems(r.items); } }, (e) => live && setError(String(e.message ?? e))).finally(() => live && setBusy(false));
    return () => { live = false; };
  }, [query, g]);

  const more = async () => {
    setBusy(true);
    try { const r = await searchListings({ ...query, page: page + 1 }, g); setItems((x) => [...x, ...r.items]); setPage(page + 1); }
    catch (e) { setError(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };
  const go = (patch: Record<string, string | undefined>) => router.setParams(patch as never);
  const submit = () => go({ q: text.trim() || undefined });

  const pick = (x: { name_en: string; name_ar: string }) => (lang === 'ar' ? x.name_ar : x.name_en);
  const f = (v: number) => formatWhole(convertFromSar(v, currency), currency, lang);
  const bandLabel = ([a, b]: [number, number]) => (!a && !b ? t('all') : !a ? `${t('under')} ${f(b)}` : !b ? `${f(a)}+` : `${f(a)}–${f(b)}`);
  const band = BANDS.find(([a, b]) => String(a || '') === (params.min ?? '') && String(b || '') === (params.max ?? '')) ?? BANDS[0];
  const cat = g.categories.find((c) => c.slug === params.cat) ?? null;
  const fashion = cat?.department === 'fashion' || params.mtm === '1';
  const facets = result?.facets;
  const filtersOn = !!(params.cat || params.seller || params.min || params.max || params.rating || params.mtm || Object.keys(attrs).length);

  const attrFacet = (a: AttributeFacet) => {
    if (!a.values) return null;
    if (!Array.isArray(a.values)) {
      const cur = (attrs[a.key] as { min?: number; max?: number } | undefined) ?? {};
      return (
        <View key={a.key} style={{ gap: 4 }}>
          <T w={600} size={10.5} caps color={colors.brassText}>{lang === 'ar' ? a.label_ar : a.label_en}{a.unit ? ` (${a.unit})` : ''}</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['min', 'max'] as const).map((k) => (
              <View key={k} style={{ flex: 1 }}>
                <Field label={t(k === 'min' ? 'srMin' : 'srMax')} value={cur[k] === undefined ? '' : String(cur[k])} placeholder={String((a.values as { min: number | null; max: number | null })[k] ?? '')} keyboardType="decimal-pad" dirLtr
                  onChangeText={(v) => { const n = v.trim() === '' ? undefined : Number(v.replace(',', '.')); const next = { ...cur, [k]: Number.isFinite(n) ? n : undefined };
                    setAttrs((x) => { const y = { ...x }; if (next.min === undefined && next.max === undefined) delete y[a.key]; else y[a.key] = next; return y; }); }} />
              </View>
            ))}
          </View>
        </View>
      );
    }
    if (!a.values.length) return null;
    const chosen = (attrs[a.key] as string[] | undefined) ?? [];
    return (
      <View key={a.key} style={{ gap: 2 }}>
        <T w={600} size={10.5} caps color={colors.brassText} style={{ marginBottom: 4 }}>{lang === 'ar' ? a.label_ar : a.label_en}</T>
        {a.values.map((v) => {
          const label = a.type === 'boolean' ? t(v.value === 'true' ? 'lfYes' : 'lfNo') : lang === 'ar' ? v.ar : v.en;
          const on = chosen.includes(v.value);
          return <FilterOption key={v.value} label={label} count={v.count} active={on}
            onPress={() => setAttrs((x) => { const next = on ? chosen.filter((c) => c !== v.value) : [...chosen, v.value]; const y = { ...x };
              if (next.length) y[a.key] = a.type === 'boolean' ? next.map((n) => n === 'true') : next; else delete y[a.key]; return y; })} />;
        })}
      </View>
    );
  };

  const filters = (
    <View style={{ gap: 22 }}>
      <View style={{ gap: 2 }}>
        <T w={600} size={10.5} caps color={colors.brassText} style={{ marginBottom: 4 }}>{cat ? t('srCategory') : t('srDepartment')}</T>
        {cat ? <FilterOption label={t('all')} radio active={false} onPress={() => go({ cat: cat.parent_id ? g.categories.find((c) => c.id === cat.parent_id)?.slug : undefined })} /> : null}
        {cat ? <FilterOption label={pick(cat)} radio active onPress={() => undefined} /> : null}
        {(cat ? facets?.categories.filter((c) => c.slug !== cat.slug) ?? [] : departments(g).map((d) => ({ slug: d.slug, name_en: d.name_en, name_ar: d.name_ar, count: undefined as number | undefined })))
          .map((c) => <FilterOption key={c.slug} label={pick(c)} count={c.count} radio active={false} onPress={() => go({ cat: c.slug })} />)}
      </View>
      {facets && (facets.sellers.length || facets.house) ? (
        <View style={{ gap: 2 }}>
          <T w={600} size={10.5} caps color={colors.brassText} style={{ marginBottom: 4 }}>{t('srSoldBy')}</T>
          {params.seller ? <FilterOption label={t('all')} radio active={false} onPress={() => go({ seller: undefined })} /> : null}
          {!params.seller && facets.house ? <FilterOption label={t('srHouse')} count={facets.house} radio active={false} onPress={() => undefined} /> : null}
          {facets.sellers.map((s) => <FilterOption key={s.slug} label={pick(s)} count={s.count} radio active={params.seller === s.slug} onPress={() => go({ seller: s.slug })} />)}
        </View>
      ) : null}
      <View style={{ gap: 2 }}>
        <T w={600} size={10.5} caps color={colors.brassText} style={{ marginBottom: 4 }}>{t('srPrice')}</T>
        {BANDS.map((b) => <FilterOption key={b.join('-')} label={bandLabel(b)} radio active={band === b} onPress={() => go({ min: b[0] ? String(b[0]) : undefined, max: b[1] ? String(b[1]) : undefined })} />)}
      </View>
      {facets?.rating.some((r) => r.count) || params.rating ? (
        <View style={{ gap: 2 }}>
          <T w={600} size={10.5} caps color={colors.brassText} style={{ marginBottom: 4 }}>{t('srRating')}</T>
          <FilterOption label={t('all')} radio active={!params.rating} onPress={() => go({ rating: undefined })} />
          {(facets?.rating ?? []).map((r) => <FilterOption key={r.min} label={t('srRatingMin').replace('{n}', String(r.min))} count={r.count} radio active={params.rating === String(r.min)} onPress={() => go({ rating: String(r.min) })} />)}
        </View>
      ) : null}
      {fashion ? <FilterOption label={t('srMadeToMeasure')} active={params.mtm === '1'} onPress={() => go({ mtm: params.mtm === '1' ? undefined : '1' })} /> : null}
      {(facets?.attributes ?? []).map(attrFacet)}
      {filtersOn ? <Button label={t('clearFilters')} kind="quiet" size="sm" onPress={() => { setAttrs({}); go({ cat: undefined, seller: undefined, min: undefined, max: undefined, rating: undefined, mtm: undefined }); }} style={{ alignSelf: 'flex-start' }} /> : null}
    </View>
  );

  const sortRow = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {SORTS.filter((s) => s !== 'relevance' || params.q).map((s) => <Chip key={s} size="sm" label={t(`srSort_${s}`)} active={(result?.sort ?? (params.q ? 'relevance' : 'featured')) === s} onPress={() => go({ sort: s })} />)}
    </View>
  );

  return (
    <Screen padded={false}>
      <Seo title={params.q ? `${params.q} | Search | Al Mukarramah` : 'Search | Al Mukarramah'} description="Search Islamic gifts, fragrance, prayer essentials and modest fashion from Al Mukarramah and approved sellers." path="/search" noindex={!!params.q} />
      <Container style={{ paddingTop: wide ? 40 : 20, paddingBottom: wide ? 56 : 28, gap: 18 }}>
        <Eyebrow rule>{t('srTitle')}</Eyebrow>
        <Serif role="h1" size={wide ? 44 : 30}>{params.q ? `${t('searchResults')} “${params.q}”` : cat ? pick(cat) : t('srTitle')}</Serif>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderColor: colors.navy, maxWidth: 720 }}>
          <Icon name="search" size={19} stroke={1.3} color={colors.navy} />
          <TextInput value={text} onChangeText={setText} onSubmitEditing={submit} returnKeyType="search" placeholder={t('searchPlaceholder')} placeholderTextColor={colors.muted}
            accessibilityLabel={t('searchPlaceholder')} style={[sans(400, isRTL), { flex: 1, fontSize: 17, paddingVertical: 12, color: colors.ink, textAlign: isRTL ? 'right' : 'left' }]} />
          <Pressable accessibilityRole="button" accessibilityLabel={t('srTitle')} onPress={submit} style={{ padding: 8 }}><T w={600} size={11} caps color={colors.navy}>{t('srGo')}</T></Pressable>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <T size={13.5} color={colors.muted} num>{result ? t('srCount').replace('{n}', String(result.total)) : ''}</T>
          {wide ? sortRow : <Button label={t('filterSort')} kind="secondary" size="sm" onPress={() => setSheet(true)} icon={<Icon name="filter" size={16} />} />}
        </View>
        <View style={{ flexDirection: 'row', gap: 36, alignItems: 'flex-start' }}>
          {wide ? <View style={{ width: 250 }}>{filters}</View> : null}
          <View style={{ flex: 1 }}>
            {error ? <T color={colors.danger}>{error}</T> : null}
            {!result && busy ? <Loading /> : null}
            {result && !items.length ? <EmptyState title={t('srNoResults')} body={t('srNoResultsBody')}>{filtersOn ? <Button label={t('clearFilters')} kind="secondary" onPress={() => { setAttrs({}); go({ cat: undefined, seller: undefined, min: undefined, max: undefined, rating: undefined, mtm: undefined }); }} /> : null}</EmptyState> : null}
            <Grid min={wide ? 220 : 150} gap={wide ? 22 : 12} cols={wide ? undefined : 2}>
              {items.map((x) => <ProductTile key={x.id} product={asProduct(x)} compact={!wide} />)}
            </Grid>
            {result && items.length < result.total ? <Button label={t('srMore')} kind="secondary" busy={busy} onPress={more} style={{ alignSelf: 'center', marginTop: 8 }} /> : null}
          </View>
        </View>
      </Container>
      <Sheet open={sheet} onClose={() => setSheet(false)} title={t('filterSort')}>
        <View style={{ gap: 22, paddingBottom: 24 }}>
          {sortRow}
          {filters}
          <Button label={t('srShow').replace('{n}', String(result?.total ?? 0))} onPress={() => setSheet(false)} full />
        </View>
      </Sheet>
    </Screen>
  );
}
