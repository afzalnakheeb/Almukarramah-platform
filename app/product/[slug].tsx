// Product page: the photograph on a pale panel with Kaaba corners, then the maker, the name, the price, one green
// action, the delivery line and the details between hairlines. Phones keep a sticky "Add to bag" bar.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { DestinationSheet, destIcon, Screen } from '@/components/chrome';
import { Corners } from '@/components/decor';
import { Icon } from '@/components/icons';
import { brandName, NOT_STUDIO, Breadcrumb, Button, CapsLink, Divider, EmptyState, Eyebrow, Grid, KiswahRule, Loading, Notice, Photo, Price, SectionHead, Serif, shortName, Stepper, T, useWide } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { Facts, Faq } from '@/components/faq';
import { data, reveal } from '@/components/motion';
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

/** One detail section between hairlines: a caps heading and its text. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingVertical: 20, borderTopWidth: 1, borderColor: colors.line, gap: 10 }}>
      <T w={600} size={10.5} caps color={colors.navy}>{title}</T>
      {children}
    </View>
  );
}

export default function ProductScreen() {
  const wide = useWide();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, pick, currency, lang, isRTL } = useI18n();
  const { destination } = usePrefs();
  const { add } = useCart();
  const [product, setProduct] = useState<Product | null | undefined>(() => snapshotProduct(slug) ?? undefined);
  const [others, setOthers] = useState<Product[]>(() => snapshotFeatured().filter((r) => r.slug !== slug && !NOT_STUDIO.includes(r.slug)).slice(0, 3));
  const [image, setImage] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState<string | null>(null);
  const [destOpen, setDestOpen] = useState(false);

  useEffect(() => {
    setProduct((cur) => (cur?.slug === slug ? cur : snapshotProduct(slug) ?? undefined));
    setImage(0);
    setQty(1);
    getProduct(slug).then((p) => setProduct(p ?? null)).catch(() => setProduct((cur) => cur ?? null));
    getFeatured().then((rows) => setOthers(rows.filter((r) => r.slug !== slug && !NOT_STUDIO.includes(r.slug)).slice(0, 3))).catch(() => undefined);
  }, [slug]);

  if (product === undefined) return <Screen><Loading /></Screen>;
  if (product === null) {
    return (
      <Screen>
        <Seo title="Gift not found | Al Mukarramah" description={t('notFound')} path={`/product/${slug}`} noindex />
        <EmptyState h1 title={t('notFound')} body={t('notFoundBody')}>
          <Button label={t('allGifts')} href="/shop" />
          <Button label={t('helpChoose')} href="/concierge" kind="quiet" />
        </EmptyState>
      </Screen>
    );
  }

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
  // The description opens beside the price (its first sentence or two); the rest waits under "About this gift".
  const desc = pick(product, 'description').trim();
  const sentences = desc.match(/[^.!?؟。]+[.!?؟。]+(\s|$)|[^.!?؟。]+$/g) ?? [];
  let lead = '';
  for (const x of sentences) { if (lead && (lead + x).length > 220) break; lead += x; }
  lead = lead.trim();
  const rest = desc.slice(lead.length).trim();
  const otherLang = lang === 'ar' ? { name: product.name_en, body: product.description_en, dir: 'ltr' as const } : { name: product.name_ar, body: product.description_ar, dir: 'rtl' as const };

  const gallery = (
    <View style={{ gap: 16 }}>
      <View>
        <Photo uri={product.images[image]} fade={450} tone={product.images[0] ? colors.sand : toneFor(product.slug)} fit="cover" motif={wide ? 200 : 150} label={pick(product, 'name')} />
        {wide && <Corners at={['ts', 'be']} len={20} inset={-12} />}
      </View>
      {product.images.length > 1 && (
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: wide ? 0 : 20 }}>
          {product.images.slice(0, 5).map((u, i) => (
            <Pressable key={u} accessibilityRole="button" accessibilityLabel={`${i + 1}`} accessibilityState={{ selected: i === image }} onPress={() => setImage(i)} {...data({ hover: 'thumb' })}
              style={{ width: wide ? 76 : 60, gap: 8, opacity: i === image ? 1 : 0.62 }}>
              <Photo uri={u} ratio={1} tone={colors.sand} fit="cover" />
              <View style={{ height: 1, backgroundColor: i === image ? colors.gold : 'transparent' }} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );

  const details = (
    <View style={{ gap: 0 }}>
      <View style={{ gap: wide ? 14 : 10 }}>
        <Eyebrow>{product.brand ? brandName(product.brand, lang === 'ar') : tag ? pick(tag, 'name') : t('appName')}</Eyebrow>
        <Serif role="h1" size={wide ? 46 : 30}>{shortName(pick(product, 'name'), product.brand)}</Serif>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <Icon name="shield" size={14} stroke={1.3} color={colors.emerald} />
          <T size={13} color={colors.body} style={{ flexShrink: 1 }}>{product.brand ? t('soldByReseller') : t('preparedLine')}</T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12, marginTop: wide ? 12 : 6 }}>
          <Price product={product} size={wide ? 21 : 19} />
          <T size={12.5} color={colors.muted}>{t('vatIncluded')}</T>
        </View>
        {lead ? <T size={wide ? 15.5 : 15} lh={1.75} color={colors.body} style={{ marginTop: wide ? 10 : 6 }}>{lead}</T> : null}
      </View>

      <Divider gold style={{ marginTop: wide ? 30 : 22, marginBottom: 20 }} />

      {product.ship_class === 'perfume_spray' && <Notice text={t('noDeliveryPerfume')} />}
      {product.restricted_countries.length > 0 && <Notice text={`${t('notToCountry')}: ${product.restricted_countries.join(', ')}`} />}

      {wide ? (
        <View style={{ marginTop: 14, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'stretch' }}>
            <View accessibilityLabel={t('quantity')}><Stepper value={qty} min={1} onChange={setQty} tall /></View>
            <View style={{ flex: 1 }}><Button size="lg" label={addLabel} disabled={soldOut} onPress={addToBag} full /></View>
          </View>
          <T size={12} color={colors.muted}>{t('includesVatDelivery')}</T>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <T w={600} size={10.5} caps color={colors.navy}>{t('quantity')}</T>
          <Stepper value={qty} min={1} onChange={setQty} />
        </View>
      )}

      {/* delivery: one quiet line between hairlines, not a box */}
      <Pressable accessibilityRole="button" onPress={() => setDestOpen(true)} {...data({ hover: 'row' })}
        style={{ flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: wide ? 28 : 22, marginBottom: 28, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}>
        <Icon name={destIcon(destination)} size={20} stroke={1.2} color={colors.brass} />
        <View style={{ flex: 1, gap: 3 }}>
          <T w={500} size={13.5} color={colors.navy}>{t('deliveringTo')}: {t(`destTitle_${destination}` as Key)}</T>
          <T size={12.5} lh={1.5} color={colors.muted}>{t(`destDesc_${destination}` as Key)}</T>
        </View>
        <View {...data({ ul: 'start' })} style={{ borderBottomWidth: 1, borderColor: colors.goldLine, paddingBottom: 3 }}>
          <T w={600} size={10.5} caps color={colors.navy}>{t('change')}</T>
        </View>
      </Pressable>

      <Facts
        title={t('quickFacts')}
        rows={[
          product.brand ? [t('factBrand'), brandName(product.brand, lang === 'ar')] : [t('factOrigin'), t('factOriginValue')],
          ...(catName ? [[t('factCategory'), catName] as [string, string]] : []),
          [t('factAvailability'), soldOut ? t('outOfStock') : t('inStock')],
          [t('factDelivery'), product.ship_class === 'perfume_spray' ? t('factDeliverySaudi') : t('factDeliveryValue')],
        ]}
      />

      <View style={{ marginTop: 28 }}>
        {rest ? (
          <Section title={t('aboutGift')}>
            <T size={14.5} lh={1.75} color={colors.body}>{rest}</T>
          </Section>
        ) : null}
        {otherLang.name ? (
          <Section title={t('language')}>
            <T size={15} w={500} lh={1.5} color={colors.navy} style={{ writingDirection: otherLang.dir, textAlign: otherLang.dir === 'rtl' ? 'right' : 'left' }}>{otherLang.name}</T>
            {otherLang.body ? <T size={14} lh={1.75} color={colors.body} style={{ writingDirection: otherLang.dir, textAlign: otherLang.dir === 'rtl' ? 'right' : 'left' }}>{otherLang.body}</T> : null}
          </Section>
        ) : null}
        <Section title={t('giftCard')}>
          <T size={14.5} lh={1.75} color={colors.body}>{t('giftCardBody')}</T>
        </Section>
        <Divider />
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
            <Breadcrumb items={[{ label: t('home'), href: '/' }, product.categories ? { label: catName, href: { pathname: '/collections/[slug]', params: { slug: product.categories.slug } } } : { label: t('shop'), href: '/shop' }, { label: shortName(pick(product, 'name'), product.brand) }]} />
            <View style={{ flexDirection: 'row', gap: 80, alignItems: 'flex-start', marginTop: 8 }}>
              <View style={{ flex: 1.1 }}>{gallery}</View>
              <View style={{ flex: 1, maxWidth: 520 }}>{details}</View>
            </View>
          </>
        ) : (
          <>
            {gallery}
            <View style={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 8 }}>{details}</View>
          </>
        )}

        {/* Reviews: only ever from verified orders, so the honest state today is an empty one */}
        <View {...reveal(0)} style={{ marginTop: wide ? 96 : 40, paddingHorizontal: wide ? 0 : 20 }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 88 : 18, alignItems: 'flex-start', borderTopWidth: 1, borderColor: colors.goldLine, paddingTop: wide ? 48 : 32 }}>
            <View style={{ flex: wide ? 0.75 : undefined, gap: 12 }}>
              <Eyebrow rule>{t('reviewsKicker')}</Eyebrow>
              <Serif role="h2" size={wide ? 44 : 30}>{t('reviewsTitle')}</Serif>
            </View>
            <View style={{ flex: wide ? 1.25 : undefined, alignSelf: 'stretch', gap: 14, paddingVertical: wide ? 8 : 0 }}>
              <KiswahRule width={72} />
              <T w={500} size={15.5} color={colors.navy}>{t('reviewsEmptyTitle')}</T>
              <T size={14.5} lh={1.7} color={colors.body}>{t('reviewsEmptyBody')}</T>
            </View>
          </View>
        </View>

        <View {...reveal(0)} style={{ marginTop: wide ? 96 : 48, paddingHorizontal: wide ? 0 : 20 }}>
          <Faq title={t('faqTitle')} kicker={t('faqKicker')} items={faqs} split={wide} />
        </View>

        {others.length > 0 && (
          <View style={{ marginTop: wide ? 112 : 56, paddingHorizontal: wide ? 0 : 20, paddingBottom: wide ? 0 : 120 }}>
            <SectionHead kicker={t('completeGiftKicker')} title={t('completeGift')} sub={t('completeGiftBody')} size={wide ? 44 : 30} reveal />
            {added && <Notice tone="ok" text={`${t('added')}: ${added}`} />}
            <Grid cols={wide ? 3 : 1} gap={wide ? 32 : 12} rowGap={wide ? 24 : 0} reveal>
              {others.map((o) => (
                <View key={o.id} style={{ flexDirection: 'row', gap: 18, alignItems: 'center', paddingVertical: 18, borderTopWidth: 1, borderBottomWidth: wide ? 1 : 0, borderColor: colors.line }}>
                  <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/product/[slug]', params: { slug: o.slug } })} {...data({ hover: 'thumb' })} style={{ width: wide ? 92 : 80 }}>
                    <Photo uri={o.images[0]} ratio={4 / 5} tone={o.images[0] ? colors.sand : toneFor(o.slug)} fit="cover" />
                  </Pressable>
                  <View style={{ flex: 1, gap: 6, alignItems: 'flex-start' }}>
                    {o.brand ? <Eyebrow size={9.5}>{brandName(o.brand, isRTL)}</Eyebrow> : null}
                    <Serif size={19} numberOfLines={2}>{shortName(pick(o, 'name'), o.brand)}</Serif>
                    <Price product={o} size={13.5} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t('addToBag')}: ${pick(o, 'name')}`}
                      disabled={o.stock <= 0}
                      onPress={() => { add(o, 1); setAdded(pick(o, 'name')); }}
                      {...data({ caps: o.stock <= 0 ? undefined : 1 })}
                      style={{ marginTop: 4, paddingBottom: 3, borderBottomWidth: 1, borderColor: colors.goldLine, opacity: o.stock <= 0 ? 0.4 : 1 }}>
                      <T w={600} size={10.5} caps color={colors.navy}>{o.stock <= 0 ? t('outOfStock') : `+ ${t('addToBag')}`}</T>
                    </Pressable>
                  </View>
                </View>
              ))}
            </Grid>
            <View style={{ marginTop: 8 }}><CapsLink label={t('viewAll')} href="/shop" /></View>
          </View>
        )}
      </Screen>

      {!wide && (
        <View style={{ backgroundColor: colors.porcelain, borderTopWidth: 1, borderColor: colors.goldLine, paddingTop: 12, paddingBottom: 24, paddingHorizontal: 20, flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <View>
            <T w={500} size={17} num color={colors.navy}>{total}</T>
            <T size={11} color={colors.muted}>{t('vatIncluded')}</T>
          </View>
          <Button label={soldOut ? t('outOfStock') : t('addToBag')} disabled={soldOut} onPress={addToBag} style={{ flex: 1, minHeight: 52 }} />
        </View>
      )}
      <DestinationSheet open={destOpen} onClose={() => setDestOpen(false)} />
    </View>
  );
}
