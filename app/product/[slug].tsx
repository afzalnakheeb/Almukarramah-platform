// Product page — follows Product.dc.html (desktop) and MProduct.dc.html (phone, sticky "Add to bag" bar).
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { destIcon, Screen } from '@/components/chrome';
import { Ornament } from '@/components/decor';
import { Icon } from '@/components/icons';
import { Breadcrumb, Button, Card, Divider, Eyebrow, Grid, Loading, Notice, Photo, Price, Row, Serif, Stepper, T, useWide } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { Facts, Faq } from '@/components/faq';
import { breadcrumbLd, faqLd, productLd, Seo } from '@/components/seo';
import { getFeatured, getProduct } from '@/lib/catalogue';
import { strings, useI18n, type Key } from '@/lib/i18n';
import { snapshot, snapshotFeatured, snapshotProduct } from '@/lib/snapshot';
import { formatMoney, priceIn } from '@/lib/money';
import { usePrefs } from '@/lib/prefs';
import type { Product } from '@/lib/types';
import { colors, toneFor } from '@/theme';

/** Pre-render a page for every product in the build-time catalogue. */
export function generateStaticParams(): { slug: string }[] {
  return snapshot.products.map((p) => ({ slug: p.slug }));
}

const FAQ_KEYS = [1, 2, 3, 4, 5] as const;

export default function ProductScreen() {
  const wide = useWide();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, pick, currency, lang } = useI18n();
  const { destination } = usePrefs();
  const { add } = useCart();
  const [product, setProduct] = useState<Product | null | undefined>(() => snapshotProduct(slug) ?? undefined);
  const [others, setOthers] = useState<Product[]>(() => snapshotFeatured().filter((r) => r.slug !== slug).slice(0, 3));
  const [image, setImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    setProduct((cur) => (cur?.slug === slug ? cur : snapshotProduct(slug) ?? undefined));
    setImage(0);
    setQty(1);
    getProduct(slug).then((p) => setProduct(p ?? null)).catch(() => setProduct((cur) => cur ?? null));
    getFeatured().then((rows) => setOthers(rows.filter((r) => r.slug !== slug).slice(0, 3))).catch(() => undefined);
  }, [slug]);

  if (product === undefined) return <Screen><Loading /></Screen>;
  if (product === null) return <Screen><Seo title="Gift not found | Al Mukarramah" description={t('notFound')} path={`/product/${slug}`} noindex /><Notice text={t('notFound')} /><Button label={t('allGifts')} href="/shop" style={{ alignSelf: 'flex-start' }} /></Screen>;

  // Search engines and AI assistants: one stable English set of answers; visitors see their own language.
  const en = strings.en;
  const faqs = FAQ_KEYS.map((n) => ({ q: t(`pfaq${n}q` as Key), a: t(`pfaq${n}a` as Key) }));
  const faqsEn = FAQ_KEYS.map((n) => ({ q: en[`pfaq${n}q` as Key], a: en[`pfaq${n}a` as Key] }));
  const catName = product.categories ? pick(product.categories, 'name') : '';
  const seo = (
    <Seo
      title={product.seo_title_en || `${product.name_en} | Al Mukarramah`}
      description={product.seo_description_en || product.description_en || product.name_en}
      path={`/product/${product.slug}`}
      image={product.images[0]}
      type="product"
      jsonLd={[
        productLd(product),
        breadcrumbLd([
          { name: 'Home', path: '/' },
          ...(product.categories ? [{ name: product.categories.name_en, path: `/collections/${product.categories.slug}` }] : [{ name: 'Shop', path: '/shop' }]),
          { name: product.name_en, path: `/product/${product.slug}` },
        ]),
        faqLd(faqsEn),
      ]}
    />
  );

  const soldOut = product.stock <= 0;
  const unit = priceIn(product, currency);
  const total = formatMoney(unit * qty, currency, lang);
  const tag = product.product_tags?.[0]?.tags;
  const addToBag = () => {
    add(product, qty);
    router.push('/cart');
  };
  const addLabel = soldOut ? t('outOfStock') : `${t('addToBag')} · ${total}`;

  const gallery = (
    <View style={{ gap: 12 }}>
      <Photo uri={product.images[image]} tone={product.images[0] ? colors.sandSoft : toneFor(product.slug)} fit="cover" style={wide ? { borderRadius: 26, borderWidth: 1, borderColor: colors.champagne } : { borderRadius: 0 }} motif={wide ? 200 : 150} label={pick(product, 'name')} />
      {product.images.length > 1 && (
        <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: wide ? 0 : 16 }}>
          {product.images.slice(0, 5).map((u, i) => (
            <Pressable key={u} accessibilityRole="button" accessibilityLabel={`${i + 1}`} onPress={() => setImage(i)} style={{ flex: 1, maxWidth: 110 }}>
              <Photo uri={u} ratio={1} tone={colors.sandSoft} fit="cover" style={[{ borderRadius: 14, borderWidth: 1, borderColor: colors.line }, i === image && { borderWidth: 2, borderColor: colors.gold }]} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  const details = (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <Eyebrow size={12}>{product.brand ? product.brand : tag ? `${t('appName')} · ${pick(tag, 'name')}` : t('appName')}</Eyebrow>
        <Serif role="h1" size={wide ? 50 : 30}>{pick(product, 'name')}</Serif>
        <Ornament color={colors.brass} width={84} style={{ marginVertical: 2 }} />
        <T size={wide ? 15 : 12.5} color={colors.body}>{product.brand ? t('soldByReseller') : t('preparedLine')}</T>
        {wide && <Price product={product} size={26} />}
      </View>

      {product.ship_class === 'perfume_spray' && <Notice text={t('noDeliveryPerfume')} />}

      {product.restricted_countries.length > 0 && (
        <Notice text={`${t('notToCountry')}: ${product.restricted_countries.join(', ')}`} />
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T w={700} size={14}>{t('quantity')}</T>
        <Stepper value={qty} min={1} onChange={setQty} />
      </View>

      <View style={{ backgroundColor: colors.sandSoft, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 18, gap: 6 }}>
        <Row label={`${pick(product, 'name')}${qty > 1 ? ` × ${qty}` : ''}`} value={total} />
        <Divider style={{ backgroundColor: '#DDD2BF', marginVertical: 4 }} />
        <Row label={t('total')} value={total} bold />
        <T size={12} color={colors.muted}>{t('includesVatDelivery')}</T>
      </View>

      <Card pad={14} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderRadius: 16 }}>
        <Icon name={destIcon(destination)} size={22} color={colors.success} />
        <View style={{ flex: 1 }}>
          <T w={700} size={14}>{t('deliveringTo')}: {t(`destTitle_${destination}` as Key)}</T>
          <T size={13} color={colors.muted}>{t(`destDesc_${destination}` as Key)}</T>
        </View>
      </Card>

      {wide && <Button size="lg" label={addLabel} disabled={soldOut} onPress={addToBag} />}

      <Facts
        title={t('quickFacts')}
        rows={[
          ...(catName ? [[t('factCategory'), catName] as [string, string]] : []),
          ...(product.sku ? [[t('factSku'), product.sku] as [string, string]] : []),
          product.brand ? [t('factBrand'), product.brand] : [t('factOrigin'), t('factOriginValue')],
          [t('factPrice'), `${formatMoney(unit, currency, lang)} · ${t('vatIncluded')}`],
          [t('factAvailability'), soldOut ? t('outOfStock') : t('inStock')],
          [t('factDelivery'), product.ship_class === 'perfume_spray' ? t('factDeliverySaudi') : t('factDeliveryValue')],
        ]}
      />

      <View style={{ borderTopWidth: 1, borderColor: colors.line }}>
        {pick(product, 'description') ? (
          <View style={{ borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 14, gap: 8 }}>
            <T w={700}>{t('aboutGift')}</T>
            <T size={14} lh={1.7} color={colors.body}>{pick(product, 'description')}</T>
          </View>
        ) : null}
        <View style={{ borderBottomWidth: 1, borderColor: colors.line, paddingVertical: 14, gap: 6 }}>
          <T w={700}>{t('language')}</T>
          <T size={14.5} w={600} lh={1.5} style={{ writingDirection: lang === 'ar' ? 'ltr' : 'rtl', textAlign: lang === 'ar' ? 'left' : 'right' }}>{lang === 'ar' ? product.name_en : product.name_ar}</T>
          <T size={14} lh={1.7} color={colors.body} style={{ writingDirection: lang === 'ar' ? 'ltr' : 'rtl', textAlign: lang === 'ar' ? 'left' : 'right' }}>{lang === 'ar' ? product.description_en : product.description_ar}</T>
        </View>
        <View style={{ paddingVertical: 14, gap: 8 }}>
          <T w={700}>{t('giftCard')}</T>
          <T size={14} lh={1.7} color={colors.body}>{t('giftCardBody')}</T>
        </View>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.ivory }}>
      <Stack.Screen options={{ title: '' }} />
      {seo}
      <Screen padded={wide}>
        {wide ? (
          <>
            <Breadcrumb items={[{ label: t('home'), href: '/' }, product.categories ? { label: catName, href: { pathname: '/collections/[slug]', params: { slug: product.categories.slug } } } : { label: t('shop'), href: '/shop' }, { label: pick(product, 'name') }]} />
            <View style={{ flexDirection: 'row', gap: 48, alignItems: 'flex-start' }}>
              <View style={{ flex: 1.1 }}>{gallery}</View>
              <View style={{ flex: 1 }}>{details}</View>
            </View>
          </>
        ) : (
          <>
            {gallery}
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 24 }}>{details}</View>
          </>
        )}

        <View style={{ marginTop: wide ? 56 : 8, paddingHorizontal: wide ? 0 : 16, maxWidth: 860 }}>
          <Faq title={t('faqTitle')} items={faqs} />
        </View>

        {others.length > 0 && (
          <View style={{ marginTop: wide ? 64 : 0, paddingHorizontal: wide ? 0 : 16, paddingBottom: wide ? 0 : 120 }}>
            <Serif role="h2" size={wide ? 38 : 28}>{t('completeGift')}</Serif>
            <T color={colors.muted} style={{ marginTop: 6, marginBottom: 20 }}>{t('completeGiftBody')}</T>
            {added && <Notice tone="ok" text={`${t('added')}: ${added}`} />}
            <Grid cols={wide ? 3 : 1} gap={18}>
              {others.map((o) => (
                <Card key={o.id} pad={14} style={{ flexDirection: 'row', gap: 14, alignItems: 'center', borderRadius: 18 }}>
                  <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: o.slug } })} style={{ width: 84 }}>
                    <Photo uri={o.images[0]} ratio={1} tone={o.images[0] ? colors.sandSoft : toneFor(o.slug)} fit="cover" style={{ borderRadius: 14 }} />
                  </Pressable>
                  <View style={{ flex: 1, gap: 3 }}>
                    <T w={700} size={14} numberOfLines={2}>{pick(o, 'name')}</T>
                    <Price product={o} size={15} />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('addToBag')}: ${pick(o, 'name')}`}
                    disabled={o.stock <= 0}
                    onPress={() => { add(o, 1); setAdded(pick(o, 'name')); }}
                    style={{ width: 44, height: 44, borderRadius: 999, borderWidth: 1, borderColor: colors.navy, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, opacity: o.stock <= 0 ? 0.4 : 1 }}>
                    <Icon name="plus" size={20} />
                  </Pressable>
                </Card>
              ))}
            </Grid>
          </View>
        )}
      </Screen>

      {!wide && (
        <View style={{ backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.line, paddingTop: 10, paddingBottom: 22, paddingHorizontal: 16, flexDirection: 'row', gap: 12, alignItems: 'center', shadowColor: colors.navy, shadowOpacity: 0.06, shadowRadius: 18, shadowOffset: { width: 0, height: -6 } }}>
          <View>
            <T w={700} size={18} color={colors.navy}>{total}</T>
            <T size={11} color={colors.muted}>{t('vatIncluded')}</T>
          </View>
          <Button label={soldOut ? t('outOfStock') : t('addToBag')} disabled={soldOut} onPress={addToBag} style={{ flex: 1, minHeight: 52 }} />
        </View>
      )}
    </View>
  );
}
