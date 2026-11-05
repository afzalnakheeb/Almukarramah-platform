// Concept pages (/concepts/elite-subscriptions, /concepts/global-brands, /concepts/collabs): the three ideas we present
// to partners and investors, each with a short film cut from the investor film. The films live in the encrypted
// investor bundle (/investors/clips/…), so they are served only behind the site passcode, like everything else.
import { Link, useLocalSearchParams, type Href } from 'expo-router';
import React from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Breadcrumb, Container, Eyebrow, Serif, T, useWide } from '@/components/ui';
import { CONCEPTS } from '@/lib/concepts';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export function generateStaticParams(): { slug: string }[] {
  return CONCEPTS.map((c) => ({ slug: c.slug }));
}

function Clip({ name, label }: { name: string; label: string }) {
  if (Platform.OS !== 'web') return null;
  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.sand, borderWidth: 1, borderColor: colors.line }}>
      <video controls playsInline preload="metadata" poster={`/investors/clips/${name}.jpg`} aria-label={label} controlsList="nodownload"
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', background: colors.sand }}>
        <source src={`/investors/clips/${name}.mp4`} type="video/mp4" />
      </video>
    </View>
  );
}

export default function ConceptPage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, lang } = useI18n();
  const wide = useWide();
  const c = CONCEPTS.find((x) => x.slug === slug) ?? CONCEPTS[0];
  const others = CONCEPTS.filter((x) => x.slug !== c.slug);

  return (
    <Screen>
      <Seo title={t(c.title)} description={t(c.body)} path={`/concepts/${c.slug}`} noindex />
      <Container style={{ paddingTop: wide ? 28 : 16 }}>
        <Breadcrumb items={[{ label: t('navDecks'), href: '/presentations' }, { label: t(c.kicker) }]} />
        <View style={{ gap: 16, maxWidth: 860, paddingTop: 12 }}>
          <Eyebrow rule>{t(c.kicker)}</Eyebrow>
          <Serif role="h1" size={wide ? 52 : 36}>{t(c.title)}</Serif>
          <T size={wide ? 17 : 15.5} lh={1.75} color={colors.body}>{t(c.body)}</T>
        </View>
        <View style={{ marginTop: wide ? 40 : 28 }}>
          <Clip name={c.clip} label={t(c.title)} />
        </View>
      </Container>

      <Container style={{ paddingTop: wide ? 56 : 40 }}>
        <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 56 : 32 }}>
          <View style={{ flex: wide ? 6 : undefined, gap: 14 }}>
            {c.points.map((k, i) => (
              <View key={k} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                <T w={600} size={13} color={colors.brassText} style={{ width: 26, paddingTop: 2 }}>{String(i + 1).padStart(2, '0')}</T>
                <T size={15.5} lh={1.6} color={colors.ink} style={{ flex: 1 }}>{t(k)}</T>
              </View>
            ))}
          </View>
          <View style={{ flex: wide ? 5 : undefined, flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            {c.figures.map((f) => (
              <View key={f.value} style={{ flexGrow: 1, flexBasis: 150, backgroundColor: colors.sandSoft, padding: 18, gap: 6, borderLeftWidth: lang === 'ar' ? 0 : 2, borderRightWidth: lang === 'ar' ? 2 : 0, borderColor: colors.gold }}>
                <Serif size={34} color={colors.emerald}>{t(f.value)}</Serif>
                <T size={13.5} lh={1.5} color={colors.body}>{t(f.label)}</T>
              </View>
            ))}
          </View>
        </View>
        {c.note ? <T size={12.5} lh={1.5} color={colors.muted} style={{ marginTop: 18 }}>{t(c.note)}</T> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18, marginTop: 28 }}>
          {c.links.map((l) => (
            <Link key={l.href} href={l.href as Href} asChild>
              <Pressable accessibilityRole="link" style={{ paddingVertical: 6 }}>
                <T w={600} size={12} caps color={colors.emerald}>{t(l.label)}</T>
              </Pressable>
            </Link>
          ))}
        </View>
      </Container>

      <Container style={{ paddingTop: 72, paddingBottom: 24 }}>
        <Eyebrow rule>{t('cnMore')}</Eyebrow>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: wide ? 28 : 14, marginTop: 18 }}>
          {others.map((o) => (
            <Link key={o.slug} href={{ pathname: '/concepts/[slug]', params: { slug: o.slug } }} asChild>
              <Pressable accessibilityRole="link" style={{ paddingVertical: 6 }}>
                <T w={500} size={15} color={colors.emerald}>{t(o.kicker)}</T>
              </Pressable>
            </Link>
          ))}
        </View>
      </Container>
    </Screen>
  );
}
