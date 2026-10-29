// Modest fashion department: ready-made (sizes) and tailor-made (your design, your measurements),
// with every fashion collection and the measuring guide.
import { Link } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Glow, Ornament, StarLattice } from '@/components/decor';
import { Icon } from '@/components/icons';
import { MeasureFigure } from '@/components/measure';
import { breadcrumbLd, itemListLd, Seo } from '@/components/seo';
import { Button, Card, Chip, Container, Eyebrow, Grid, ProductTile, Serif, T, useWide } from '@/components/ui';
import { getCategories, getProducts } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import { snapshot } from '@/lib/snapshot';
import type { Category, Product } from '@/lib/types';
import { colors } from '@/theme';

const isFashion = (p: Product, cats: Category[]) => cats.some((c) => c.department === 'fashion' && c.slug === p.categories?.slug);

export default function Fashion() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const [cats, setCats] = useState<Category[]>(() => snapshot.categories.filter((c) => c.department === 'fashion'));
  const [rows, setRows] = useState<Product[]>(() => snapshot.products.filter((p) => isFashion(p, snapshot.categories)));
  const [mode, setMode] = useState<'all' | 'ready' | 'tailored'>('all');
  useEffect(() => {
    getCategories().then((c) => {
      const f = c.filter((x) => x.department === 'fashion');
      setCats(f);
      getProducts({}).then((all) => setRows(all.filter((p) => isFashion(p, f)))).catch(() => undefined);
    }).catch(() => undefined);
  }, []);
  const shown = rows.filter((p) => mode === 'all' || (mode === 'tailored' ? p.made_to_measure : !p.made_to_measure));

  const door = (kind: 'ready' | 'tailored') => (
    <Pressable accessibilityRole="button" onPress={() => setMode(kind)}
      style={{ flex: 1, backgroundColor: kind === 'tailored' ? colors.night : colors.white, borderRadius: 24, borderWidth: 1, borderColor: kind === 'tailored' ? colors.gold : colors.champagne, padding: wide ? 28 : 18, gap: 10, overflow: 'hidden', minHeight: wide ? 260 : undefined }}>
      {kind === 'tailored' && <StarLattice opacity={0.08} size={56} />}
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 8 }}>
          <Eyebrow size={12} color={kind === 'tailored' ? colors.gold : colors.brassText}>{t(kind === 'tailored' ? 'tailorMade' : 'readyMade')}</Eyebrow>
          <Serif size={wide ? 38 : 28} color={kind === 'tailored' ? colors.white : colors.navy}>{t(kind === 'tailored' ? 'fashionTailoredTitle' : 'fashionReadyTitle')}</Serif>
          <T size={14.5} lh={1.6} color={kind === 'tailored' ? colors.onNight : colors.body}>{t(kind === 'tailored' ? 'fashionTailoredBody' : 'fashionReadyBody')}</T>
        </View>
        {kind === 'tailored' && wide && <MeasureFigure garment="thobe" highlight="chest" size={130} />}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
        <T w={700} size={14} color={kind === 'tailored' ? colors.goldBright : colors.navy}>{t('fashionBrowse')}</T>
        <Icon name={lang === 'ar' ? 'arrowLeft' : 'arrowRight'} size={16} color={kind === 'tailored' ? colors.goldBright : colors.navy} />
      </View>
    </Pressable>
  );

  return (
    <Screen padded={false}>
      <Seo title="Modest fashion: thobes and abayas, ready-made or tailor-made | Al Mukarramah"
        description="Thobes, abayas, modest dresses and hijabs from independent brands. Buy ready-made in your size, or design a tailor-made garment and measure yourself with our step-by-step guide."
        path="/fashion" jsonLd={[itemListLd('Modest fashion', shown), breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'Modest fashion', path: '/fashion' }])]} />
      <View style={{ backgroundColor: colors.night, overflow: 'hidden' }}>
        <StarLattice opacity={0.07} size={70} />
        <Glow cx="78%" cy="30%" r="55%" opacity={0.22} />
        <Container style={{ paddingVertical: wide ? 64 : 30, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 28, height: 1, backgroundColor: colors.gold }} />
            <Eyebrow size={wide ? 13 : 11} color={colors.gold}>{t('fashionKicker')}</Eyebrow>
          </View>
          <Serif role="h1" size={wide ? 64 : 38} color={colors.white}>{t('fashionTitle')}</Serif>
          <Ornament width={110} />
          <T size={wide ? 18 : 15} lh={1.65} color={colors.onNight} style={{ maxWidth: 700 }}>{t('fashionBody')}</T>
        </Container>
      </View>

      <Container style={{ paddingVertical: wide ? 44 : 22, gap: wide ? 28 : 18 }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: 16 }}>
          {door('ready')}
          {door('tailored')}
        </View>

        <Card pad={wide ? 24 : 16} style={{ flexDirection: wide ? 'row' : 'column', gap: 16, alignItems: wide ? 'center' : 'stretch', borderColor: colors.champagne, backgroundColor: colors.goldSoft }}>
          <View style={{ flex: 1, gap: 6 }}>
            <T w={700} size={17} color={colors.navy}>{t('measureGuideTitle')}</T>
            <T size={14} lh={1.6} color={colors.body}>{t('measureGuideBody')}</T>
          </View>
          <Button label={t('measureGuideOpen')} href="/tailoring/measure" />
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={t('all')} active={mode === 'all'} onPress={() => setMode('all')} />
          <Chip label={t('readyMade')} active={mode === 'ready'} onPress={() => setMode('ready')} />
          <Chip label={t('tailorMade')} active={mode === 'tailored'} onPress={() => setMode('tailored')} />
          {cats.map((c) => (
            <Link key={c.id} href={{ pathname: '/collections/[slug]', params: { slug: c.slug } }} asChild>
              <Pressable accessibilityRole="link" style={{ paddingHorizontal: 14, minHeight: 40, justifyContent: 'center', borderRadius: 999, borderWidth: 1, borderColor: colors.champagne, backgroundColor: colors.white }}>
                <T w={700} size={13} color={colors.brassText}>{lang === 'ar' ? c.name_ar : c.name_en}</T>
              </Pressable>
            </Link>
          ))}
        </View>

        {shown.length ? (
          <Grid min={wide ? 240 : 150} gap={wide ? 22 : 12} cols={wide ? undefined : 2}>
            {shown.map((p) => <ProductTile key={p.id} product={p} compact={!wide} />)}
          </Grid>
        ) : (
          <Card pad={wide ? 28 : 18} style={{ alignItems: 'center', gap: 10, borderColor: colors.champagne }}>
            <Serif size={28} center>{t('fashionSoonTitle')}</Serif>
            <T color={colors.body} center style={{ maxWidth: 560 }}>{t('fashionSoonBody')}</T>
            <Button label={t('sellOnAM')} kind="secondary" href="/sell" />
          </Card>
        )}
      </Container>
    </Screen>
  );
}
