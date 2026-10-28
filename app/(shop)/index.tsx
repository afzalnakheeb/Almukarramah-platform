import { Image } from 'expo-image';
import { Link, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Chip, Grid, Loading, Notice, ProductCard, Screen, Section } from '@/components/ui';
import { getFeatured, getSettings, getTags } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import { CURRENCIES, convertFromSar, formatMoney } from '@/lib/money';
import type { Product, Tag } from '@/lib/types';
import { colors, radius, space, type } from '@/theme';

const BUDGETS_SAR = [10000, 25000, 50000]; // halalas: under SAR 100, 250, 500

export default function Home() {
  const { t, pick, lang, setLang, currency, setCurrency } = useI18n();
  const [occasions, setOccasions] = useState<Tag[]>([]);
  const [recipients, setRecipients] = useState<Tag[]>([]);
  const [featured, setFeatured] = useState<Product[] | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    getTags('occasion').then(setOccasions).catch(() => undefined);
    getTags('recipient').then(setRecipients).catch(() => undefined);
    getFeatured().then(setFeatured).catch(() => setFeatured([]));
    getSettings().then((s) => {
      if (!s) return;
      setClosed(!s.store_open);
      setBanner(lang === 'ar' ? s.banner_ar : s.banner_en);
    });
  }, [lang]);

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Image source={require('../../assets/logo.png')} style={{ width: 150, height: 44 }} contentFit="contain" accessibilityLabel={t('appName')} />
        <View style={{ flexDirection: 'row', gap: space(1) }}>
          <Chip label={t('language')} onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} />
          <Chip label={currency} onPress={() => setCurrency(CURRENCIES[(CURRENCIES.indexOf(currency as never) + 1) % CURRENCIES.length])} />
        </View>
      </View>

      {closed && <Notice tone="warn" text={t('storeClosed')} />}
      {banner ? <Notice text={banner} /> : null}

      <View style={{ backgroundColor: colors.navy, borderRadius: radius.lg, padding: space(3), marginTop: space(2) }}>
        <Text style={[type.display, { color: colors.white }]}>{t('tagline')}</Text>
        <Button label={t('concierge')} kind="secondary" style={{ marginTop: space(2), alignSelf: 'flex-start' }} onPress={() => router.push('/concierge')} />
      </View>

      <Section title={t('occasionTitle')}>
        <Grid>
          {occasions.map((o) => (
            <Link key={o.id} href={{ pathname: '/shop', params: { tag: o.slug } }} asChild>
              <Pressable style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space(2), minWidth: 140, flexGrow: 1 }}>
                <Text style={[type.title, { fontSize: 17 }]}>{pick(o, 'name')}</Text>
              </Pressable>
            </Link>
          ))}
        </Grid>
      </Section>

      <Section title={t('forWhom')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1) }}>
          {recipients.map((r) => (
            <Chip key={r.id} label={pick(r, 'name')} onPress={() => router.push({ pathname: '/shop', params: { tag: r.slug } })} />
          ))}
        </View>
      </Section>

      <Section title={t('byBudget')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1) }}>
          {BUDGETS_SAR.map((b) => (
            <Chip key={b} label={`${t('under')} ${formatMoney(convertFromSar(b, currency), currency, lang)}`} onPress={() => router.push({ pathname: '/shop', params: { max: String(b) } })} />
          ))}
        </View>
      </Section>

      <Section title={t('featured')}>
        {featured === null ? <Loading /> : <Grid>{featured.map((p) => <ProductCard key={p.id} product={p} />)}</Grid>}
      </Section>

      <Section title={t('membership')}>
        <Notice text={`${t('quranTrail')} · ${t('seerahTrail')}`} />
        <Button label={t('membership')} onPress={() => router.push('/membership')} style={{ alignSelf: 'flex-start' }} />
      </Section>
    </Screen>
  );
}
