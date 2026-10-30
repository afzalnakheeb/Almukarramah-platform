// The seller handbook, laid out for reading: a quiet side index of the handbook pages, sections with gold diamonds,
// accepted and not-accepted examples side by side, the Islamic standard's rules and each category's requirements.
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { GUIDE_PAGES, type Bi, type GuidePage, type GuideSection } from '@/lib/guidelines';
import { useI18n } from '@/lib/i18n';
import { openExternal } from '@/lib/links';
import {
  attributesOf, days, leavesUnder, percent, type CategoryNode, type Guidance, type PolicyRule,
} from '@/lib/market';
import { colors } from '@/theme';
import { Screen } from './chrome';
import { countryName } from './country';
import { Ornament } from './decor';
import { Icon } from './icons';
import { data } from './motion';
import { breadcrumbLd, Seo } from './seo';
import { Breadcrumb, Button, Card, Eyebrow, Serif, T, Tag, useWide } from './ui';

const Diamond = ({ color = colors.gold }: { color?: string }) => (
  <View style={{ width: 6, height: 6, backgroundColor: color, transform: [{ rotate: '45deg' }], marginTop: 8 }} />
);

/** Every handbook page: breadcrumb, title, the page index (side on desktop, chips on phones), content and the call to apply. */
export function GuideLayout({ page, title, intro, seoTitle, seoDescription, children }: {
  page: GuidePage['id']; title: string; intro: string; seoTitle: string; seoDescription: string; children: React.ReactNode;
}) {
  const wide = useWide();
  const { t, lang } = useI18n();
  const me = GUIDE_PAGES.find((p) => p.id === page)!;
  const crumbs = [{ label: t('home'), href: '/' as const }, { label: t('sellOnAM'), href: '/sell' as const }];
  if (page !== 'handbook') crumbs.push({ label: t('mkHandbook'), href: '/sell/guidelines' as never });
  return (
    <Screen style={{ maxWidth: 1180 }}>
      <Seo title={seoTitle} description={seoDescription} path={me.href}
        jsonLd={breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Sell on Al Mukarramah', path: '/sell' },
          ...(page === 'handbook' ? [] : [{ name: 'Seller handbook', path: '/sell/guidelines' }]), { name: me.title.en, path: me.href }])} />
      <Breadcrumb items={[...crumbs, { label: me.title[lang] }]} />
      <View style={{ gap: 12, marginBottom: wide ? 40 : 22, maxWidth: 820 }}>
        <Eyebrow rule>{page === 'handbook' ? t('sellOnAM') : t('mkHandbook')}</Eyebrow>
        <Serif role="h1" size={wide ? 52 : 34}>{title}</Serif>
        <Ornament width={96} />
        <T size={wide ? 16.5 : 15} lh={1.7} color={colors.body}>{intro}</T>
      </View>
      {!wide && <GuideChips current={page} />}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 64 : 24, alignItems: 'flex-start' }}>
        {wide && <GuideIndex current={page} />}
        <View style={{ flex: 1, alignSelf: 'stretch', gap: wide ? 44 : 28 }}>
          {children}
          <ApplyCard />
        </View>
      </View>
    </Screen>
  );
}

/** Desktop: the handbook pages as a quiet list; the current one carries a gold rule on the reading side. */
function GuideIndex({ current }: { current: string }) {
  const { lang } = useI18n();
  return (
    <View role="navigation" style={{ width: 250, gap: 2, borderTopWidth: 1, borderColor: colors.line, paddingTop: 14 }}>
      {GUIDE_PAGES.map((p) => {
        const on = p.id === current;
        return (
          <Link key={p.id} href={p.href} {...data({ foot: 1 })}
            style={{ paddingVertical: 10, paddingHorizontal: 14, borderStartWidth: 1, borderColor: on ? colors.gold : 'transparent' }}>
            <T w={on ? 600 : 400} size={14} color={on ? colors.navy : colors.body}>{p.title[lang]}</T>
          </Link>
        );
      })}
    </View>
  );
}

/** Phones: the handbook pages as a row of fine chips. */
function GuideChips({ current }: { current: string }) {
  const { lang } = useI18n();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18, marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
      {GUIDE_PAGES.map((p) => (
        <Link key={p.id} href={p.href} {...data({ chip: p.id === current ? 'on' : 'off' })}
          style={{ paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: p.id === current ? colors.emerald : colors.line, backgroundColor: p.id === current ? colors.emeraldSoft : 'transparent' }}>
          <T w={500} size={12.5} color={p.id === current ? colors.emerald : colors.navy}>{p.title[lang]}</T>
        </Link>
      ))}
    </ScrollView>
  );
}

/** The call to apply at the foot of every handbook page. */
function ApplyCard() {
  const { t } = useI18n();
  const wide = useWide();
  return (
    <View style={{ borderTopWidth: 1, borderColor: colors.goldLine, paddingTop: wide ? 36 : 24, gap: 12 }}>
      <Serif role="h2" size={wide ? 34 : 26}>{t('mkApplyCta')}</Serif>
      <T size={15} lh={1.65} color={colors.body} style={{ maxWidth: 640 }}>{t('mkApplyCtaBody')}</T>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, marginTop: 6 }}>
        <Button label={t('sellApplyNow')} href="/sell" size="lg" />
        <Button label={t('askBeforeListing')} kind="secondary" size="lg" onPress={() => openExternal('mailto:hello@almukarramah.com?subject=Seller%20question')} />
      </View>
    </View>
  );
}

/** Accepted and not-accepted examples, side by side on desktop. */
export function Examples({ accepted, rejected }: { accepted?: Bi[]; rejected?: Bi[] }) {
  const { t, lang } = useI18n();
  const wide = useWide();
  if (!accepted?.length && !rejected?.length) return null;
  const col = (list: Bi[], ok: boolean) => (
    <View style={{ flex: 1, gap: 10, borderTopWidth: 1, borderColor: ok ? colors.emeraldLine : 'rgba(158,44,34,0.32)', paddingTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={ok ? 'check' : 'close'} size={15} color={ok ? colors.success : colors.danger} stroke={2} />
        <T w={600} size={10.5} caps color={ok ? colors.success : colors.danger}>{ok ? t('mkAccepted') : t('mkRejected')}</T>
      </View>
      {list.map((e) => <T key={e.en} size={14} lh={1.6} color={colors.body}>{e[lang]}</T>)}
    </View>
  );
  return (
    <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 28 : 16, marginTop: 6 }}>
      {accepted?.length ? col(accepted, true) : null}
      {rejected?.length ? col(rejected, false) : null}
    </View>
  );
}

/** A handbook section: serif title, intro, gold-diamond items and examples. */
export function GuideSectionView({ s, n }: { s: GuideSection; n?: number }) {
  const { lang } = useI18n();
  const wide = useWide();
  return (
    <View nativeID={s.id} style={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
        {n !== undefined ? <Serif size={wide ? 30 : 24} color={colors.brass}>{n}</Serif> : null}
        <Serif role="h2" size={wide ? 32 : 25} style={{ flexShrink: 1 }}>{s.title[lang]}</Serif>
      </View>
      {s.intro ? <T size={15} lh={1.7} color={colors.body}>{s.intro[lang]}</T> : null}
      <View style={{ gap: 12 }}>
        {s.items.map((it) => (
          <View key={it.t.en} style={{ flexDirection: 'row', gap: 12 }}>
            <Diamond />
            <View style={{ flex: 1, gap: 3 }}>
              <T w={600} size={15} color={colors.navy}>{it.t[lang]}</T>
              {it.d ? <T size={14} lh={1.6} color={colors.body}>{it.d[lang]}</T> : null}
            </View>
          </View>
        ))}
      </View>
      <Examples accepted={s.accepted} rejected={s.rejected} />
    </View>
  );
}

/** One rule of the Islamic standard. */
export function RuleRow({ rule }: { rule: PolicyRule }) {
  const { t, lang } = useI18n();
  const wide = useWide();
  return (
    <View nativeID={rule.code} style={{ gap: 10, paddingVertical: wide ? 22 : 18, borderTopWidth: 1, borderColor: colors.line }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <T w={600} size={16.5} color={colors.navy} style={{ flexShrink: 1 }}>{lang === 'ar' ? rule.title_ar : rule.title_en}</T>
        {rule.level === 'restricted' ? <Tag label={t('mkTeamDecides')} tone="warn" /> : null}
        {rule.level === 'prohibited' && rule.severity === 'severe' ? <Tag label={t('mkSevere')} tone="err" /> : null}
        {rule.needs_scholar_confirmation ? <Tag label={t('mkScholarPending')} tone="sample" /> : null}
      </View>
      <T size={14.5} lh={1.65} color={colors.body}>{lang === 'ar' ? rule.guidance_ar : rule.guidance_en}</T>
      <Examples accepted={rule.accepted_examples} rejected={rule.rejected_examples} />
    </View>
  );
}

/** A fact row inside a category card: a caps label and its value. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 5 }}>
      <T w={600} size={10.5} caps color={colors.muted} style={{ width: 118, paddingTop: 3 }}>{label}</T>
      <T size={13.5} lh={1.5} color={colors.ink} style={{ flex: 1 }}>{value}</T>
    </View>
  );
}

/** A department with its categories: shared guidance and examples, then each category's requirements. */
export function DepartmentBlock({ g, dept, filter }: { g: Guidance; dept: CategoryNode; filter?: string }) {
  const { lang } = useI18n();
  const wide = useWide();
  const q = (filter ?? '').trim().toLowerCase();
  const leaves = leavesUnder(g, dept).filter((c) => c.listable && (!q || `${c.name_en} ${c.name_ar} ${dept.name_en} ${dept.name_ar}`.toLowerCase().includes(q)));
  if (!leaves.length) return null;
  return (
    <View nativeID={dept.slug} style={{ gap: 16 }}>
      <View style={{ gap: 8 }}>
        <Serif role="h2" size={wide ? 34 : 26}>{lang === 'ar' ? dept.name_ar : dept.name_en}</Serif>
        {(lang === 'ar' ? dept.guidance_ar : dept.guidance_en) ? <T size={14.5} lh={1.65} color={colors.body}>{lang === 'ar' ? dept.guidance_ar : dept.guidance_en}</T> : null}
        <Examples accepted={dept.accepted_examples} rejected={dept.rejected_examples} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {leaves.map((c) => <CategoryCard key={c.id} g={g} cat={c} />)}
      </View>
    </View>
  );
}

/** One category's requirements: details to give, documents, photos, returns, shipping and commission. */
export function CategoryCard({ g, cat }: { g: Guidance; cat: CategoryNode }) {
  const { t, lang } = useI18n();
  const wide = useWide();
  const p = cat.policy;
  const attrs = attributesOf(g, cat);
  const docs = (p?.required_documents ?? []).map((code) => g.documents.find((d) => d.code === code)).filter(Boolean) as Guidance['documents'];
  const slugs = new Set([cat.slug, ...g.categories.filter((c) => c.id === cat.parent_id).map((c) => c.slug)]);
  const permits = (g.permits ?? []).filter((r) => r.category_slugs.some((s) => slugs.has(s) || s === cat.slug));
  const ret = !p ? '' : p.return_policy === 'none' || p.return_window_days === 0 ? t('mkRetNone')
    : `${t(p.return_policy === 'unopened_only' ? 'mkRetUnopened' : p.return_policy === 'faulty_only' ? 'mkRetFaulty' : 'mkRetStandard')} ${days(p.return_window_days, lang)}`;
  const ship = !p ? '' : [p.ship_domestic_only && p.ship_to_countries?.includes('SA') ? t('mkShipSaudiOnly') : null,
    p.dangerous_goods ? t('mkShipDangerous') : null].filter(Boolean).join(' · ') || t('mkShipOpen');
  const lastOwn = cat.guidance_en ? (lang === 'ar' ? cat.guidance_ar : cat.guidance_en) : null;
  return (
    <Card pad={wide ? 22 : 16} style={{ flexGrow: 1, flexBasis: wide ? 380 : '100%', maxWidth: wide ? undefined : '100%', gap: 10 }}>
      <View nativeID={`cat-${cat.slug}`} style={{ gap: 4 }}>
        <T w={600} size={16} color={colors.navy}>{lang === 'ar' ? cat.name_ar : cat.name_en}</T>
        {lastOwn ? <T size={13.5} lh={1.55} color={colors.body}>{lastOwn}</T> : null}
        {p?.always_review ? <T size={12.5} lh={1.5} color={colors.brassText}>{t('mkTeamReviews')}</T> : null}
      </View>
      <View style={{ borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 6 }}>
        {p ? <Fact label={t('mkPhotos')} value={`${p.min_photos}+ · ${p.min_long_side_px} ${t('mkPx')}`} /> : null}
        {p ? <Fact label={t('mkReturns')} value={ret} /> : null}
        {p ? <Fact label={t('mkShipping')} value={ship} /> : null}
        {p?.allow_made_to_measure ? <Fact label={t('mkMadeToMeasure')} value={t('mkMtmOffered')} /> : null}
        {p?.min_shelf_days ? <Fact label={t('mkShelfLife')} value={days(p.min_shelf_days, lang)} /> : null}
        {p?.min_price_minor ? <Fact label={t('mkMinPrice')} value={`SAR ${(p.min_price_minor / 100).toFixed(0)}`} /> : null}
        {p ? <Fact label={t('mkCommission')} value={percent(p.commission_bps)} /> : null}
      </View>
      <View style={{ gap: 6 }}>
        <T w={600} size={10.5} caps color={colors.navy}>{t('mkRequiredDetails')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {attrs.filter((a) => a.required).map((a) => (
            <View key={a.key} style={styles.pill}><T size={12.5} color={colors.ink}>{lang === 'ar' ? a.label_ar : a.label_en}</T></View>
          ))}
        </View>
      </View>
      {docs.length || permits.length ? (
        <View style={{ gap: 6 }}>
          <T w={600} size={10.5} caps color={colors.navy}>{t('mkDocuments')}</T>
          {docs.map((d) => <T key={d.code} size={13.5} lh={1.5} color={colors.body}>· {lang === 'ar' ? d.label_ar : d.label_en}</T>)}
          {permits.map((r) => (
            <T key={r.permit_key + r.to_country} size={13.5} lh={1.5} color={colors.body}>· {lang === 'ar' ? r.label_ar : r.label_en} ({countryName(r.to_country, lang)})</T>
          ))}
        </View>
      ) : null}
      <Examples accepted={cat.accepted_examples} rejected={cat.rejected_examples} />
    </Card>
  );
}

/** The handbook home: one quiet card per page. */
export function GuideCards() {
  const { lang } = useI18n();
  const wide = useWide();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {GUIDE_PAGES.filter((p) => p.id !== 'handbook').map((p) => (
        <Link key={p.id} href={p.href} asChild>
          <Pressable accessibilityRole="link" {...data({ hover: 'row' })} style={StyleSheet.flatten([styles.guideCard, { flexBasis: wide ? 340 : '100%' }])}>
            <T w={600} size={16.5} color={colors.navy}>{p.title[lang]}</T>
            <T size={14} lh={1.6} color={colors.body}>{p.line[lang]}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <View style={{ height: 1, width: 22, backgroundColor: colors.gold }} />
              <Icon name={lang === 'ar' ? 'arrowLeft' : 'arrowRight'} size={16} color={colors.brass} />
            </View>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: colors.ivory },
  guideCard: { flexGrow: 1, gap: 8, padding: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.porcelain },
});
