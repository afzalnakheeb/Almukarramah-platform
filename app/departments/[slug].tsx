// Department pages (/departments/prayer …): the house's six departments. Each shows its introduction, three kinds of
// product and a gift idea, then the live products of its categories (real, from the catalogue), then the collections
// we are preparing, with credited reference photographs (src/lib/departments.ts).
import { Link, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Breadcrumb, Button, Container, Eyebrow, Grid, Photo, ProductTile, Serif, T, Tag, useWide } from '@/components/ui';
import { COVER_CREDIT, DEPARTMENTS, TOP_DEPARTMENTS, departmentHref, subDepartments, type Collection } from '@/lib/departments';
import { partnerHref, partnerItemsFor, type Partner, type PartnerItem } from '@/lib/partners';
import { useI18n } from '@/lib/i18n';
import { snapshot, snapshotByCategory } from '@/lib/snapshot';
import { colors } from '@/theme';

export function generateStaticParams(): { slug: string }[] {
  return DEPARTMENTS.map((d) => ({ slug: d.slug }));
}

function CollectionCard({ c }: { c: Collection }) {
  const { t } = useI18n();
  const concept = c.status === 'concept';
  const label = concept ? `${t(c.title)}: ${t('deptConceptLine')}` : `${c.maker}, ${c.piece}`;
  return (
    <View style={{ gap: 10 }}>
      <Photo uri={c.img} ratio={4 / 5} tone={colors.white} label={label} />
      {concept ? <View style={{ flexDirection: 'row' }}><Tag label={t('deptConceptTag')} tone="mute" /></View> : null}
      <Serif size={22}>{t(c.title)}</Serif>
      <T size={13} lh={1.5} color={colors.muted}>{concept ? t('deptConceptLine') : `${c.maker} · ${c.piece}`}</T>
    </View>
  );
}

/** A piece from one of our partner houses: opens the house's own page. */
export function PartnerCard({ it, partner }: { it: PartnerItem; partner: Partner }) {
  const { t, lang } = useI18n();
  const name = lang === 'ar' ? it.ar : it.en;
  return (
    <Link href={partnerHref(partner.slug)} asChild>
      <Pressable accessibilityRole="link" {...{ dataSet: { hover: 'door' } }} style={{ gap: 10 }}>
        <Photo uri={it.img} ratio={4 / 5} tone={colors.white} label={`${partner.name}, ${it.en}`} />
        <T w={600} size={11.5} caps color={colors.brassText}>{lang === 'ar' ? partner.nameAr : partner.name}</T>
        <Serif size={20}>{name}</Serif>
      </Pressable>
    </Link>
  );
}

export default function DepartmentPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, lang } = useI18n();
  const wide = useWide();
  const d = DEPARTMENTS.find((x) => x.slug === slug) ?? DEPARTMENTS[0];
  const cats = d.categories.map((s) => snapshot.categories.find((c) => c.slug === s)).filter(Boolean) as typeof snapshot.categories;
  // Houses side by side: one piece from each brand in turn, so a large range does not crowd out a smaller one.
  const byBrand = new Map<string, ReturnType<typeof snapshotByCategory>>();
  for (const p of d.categories.flatMap((s) => snapshotByCategory(s))) {
    const k = p.brand ?? '';
    byBrand.set(k, [...(byBrand.get(k) ?? []), p]);
  }
  const lists = [...byBrand.values()];
  const products = Array.from({ length: Math.max(0, ...lists.map((l) => l.length)) }, (_, i) => lists.map((l) => l[i]))
    .flat().filter(Boolean).slice(0, 12) as ReturnType<typeof snapshotByCategory>;
  const credit = COVER_CREDIT[d.slug];
  const subs = subDepartments(d.slug);
  const parent = d.parent ? DEPARTMENTS.find((x) => x.slug === d.parent) : undefined;
  const fromPartners = [d.slug, ...subs.map((x) => x.slug)].flatMap((s) => partnerItemsFor(s));
  const others = TOP_DEPARTMENTS.filter((x) => x.slug !== d.slug && x.slug !== d.parent);

  return (
    <Screen>
      <Seo title={t(d.title)} description={t(d.intro)} path={`/departments/${d.slug}`} image={d.cover} noindex />
      <Container style={{ paddingTop: wide ? 28 : 16 }}>
        <Breadcrumb items={[{ label: t('deptAll'), href: '/' }, ...(parent ? [{ label: t(parent.title), href: departmentHref(parent.slug) }] : []), { label: t(d.title) }]} />
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 64 : 24, alignItems: wide ? 'center' : 'stretch', paddingTop: 20 }}>
          <View style={{ flex: wide ? 5 : undefined, gap: 6 }}>
            <Photo uri={d.cover} ratio={4 / 5} label={t(d.title)} />
            <T size={11.5} color={colors.muted}>{credit ? credit : t('deptConcept')}</T>
          </View>
          <View style={{ flex: wide ? 6 : undefined, gap: 18 }}>
            <Eyebrow rule>{t('deptKicker')}</Eyebrow>
            <Serif role="h1" size={wide ? 54 : 38}>{t(d.title)}</Serif>
            <T size={wide ? 17 : 15.5} lh={1.75} color={colors.body} style={{ maxWidth: 560 }}>{t(d.intro)}</T>
            <View style={{ gap: 8, paddingTop: 6 }}>
              <T w={600} size={11} caps color={colors.brassText}>{t('deptExamples')}</T>
              {d.examples.map((k) => (
                <View key={k} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <View style={{ width: 5, height: 5, backgroundColor: colors.gold, transform: [{ rotate: '45deg' }] }} />
                  <T size={15} color={colors.ink}>{t(k)}</T>
                </View>
              ))}
            </View>
            <View style={{ backgroundColor: colors.sandSoft, padding: 18, borderLeftWidth: lang === 'ar' ? 0 : 2, borderRightWidth: lang === 'ar' ? 2 : 0, borderColor: colors.gold, gap: 6 }}>
              <T w={600} size={11} caps color={colors.brassText}>{t('deptOccasion')}</T>
              <T size={15} lh={1.6} color={colors.ink}>{t(d.gift)}</T>
            </View>
            {cats.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 4 }}>
                {cats.map((c) => (
                  <Button key={c.slug} kind="secondary" size="sm" label={lang === 'ar' ? c.name_ar : c.name_en}
                    href={{ pathname: '/collections/[slug]', params: { slug: c.slug } }} />
                ))}
              </View>
            )}
          </View>
        </View>
      </Container>

      {subs.length > 0 && (
        <Container style={{ paddingTop: 64 }}>
          <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 28 : 24 }}>
            {subs.map((x) => (
              <Link key={x.slug} href={departmentHref(x.slug)} asChild>
                <Pressable accessibilityRole="link" {...{ dataSet: { hover: 'door' } }} style={{ flex: 1, gap: 12 }}>
                  <Photo uri={x.cover} ratio={4 / 5} label={t(x.title)} />
                  <Serif size={wide ? 32 : 26}>{t(x.title)}</Serif>
                  <T size={14.5} lh={1.6} color={colors.body}>{t(x.intro)}</T>
                  <T w={600} size={11.5} caps color={colors.emerald}>{t('deptOpen')}</T>
                </Pressable>
              </Link>
            ))}
          </View>
        </Container>
      )}

      {fromPartners.length > 0 && (
        <Container style={{ paddingTop: 72 }}>
          <Serif size={wide ? 36 : 28}>{t('deptFromPartners')}</Serif>
          <T size={14} lh={1.65} color={colors.muted} style={{ maxWidth: 640, marginTop: 10, marginBottom: 28 }}>{t('deptFromPartnersNote')}</T>
          <Grid min={wide ? 240 : 150} gap={wide ? 28 : 14} rowGap={36}>
            {fromPartners.map((it) => <PartnerCard key={it.partner.slug + it.id} it={it} partner={it.partner} />)}
          </Grid>
        </Container>
      )}

      {products.length > 0 && (
        <Container style={{ paddingTop: 72 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
            <Serif size={wide ? 36 : 28}>{t('deptShopNow')}</Serif>
          </View>
          <Grid min={wide ? 230 : 150} gap={wide ? 24 : 14} rowGap={36}>
            {products.map((p) => <ProductTile key={p.id} product={p} compact={!wide} />)}
          </Grid>
        </Container>
      )}

      {d.collections.length > 0 && (
        <Container style={{ paddingTop: 72 }}>
          <Serif size={wide ? 36 : 28}>{t('deptInPrep')}</Serif>
          <T size={14} lh={1.65} color={colors.muted} style={{ maxWidth: 640, marginTop: 10, marginBottom: 28 }}>{t('deptInPrepNote')}</T>
          <Grid min={wide ? 240 : 150} gap={wide ? 28 : 14} rowGap={36}>
            {d.collections.map((c) => <CollectionCard key={c.img} c={c} />)}
          </Grid>
        </Container>
      )}

      <Container style={{ paddingTop: 80, paddingBottom: 24 }}>
        <Eyebrow rule>{t('deptAll')}</Eyebrow>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: wide ? 28 : 14, marginTop: 18 }}>
          {others.map((o) => (
            <Link key={o.slug} href={departmentHref(o.slug)} asChild>
              <Pressable accessibilityRole="link" style={{ paddingVertical: 6 }}>
                <T w={500} size={15} color={colors.emerald}>{t(o.title)}</T>
              </Pressable>
            </Link>
          ))}
        </View>
      </Container>
    </Screen>
  );
}
