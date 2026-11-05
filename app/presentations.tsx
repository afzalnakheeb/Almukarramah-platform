// /presentations: the "Decks" tab. Everything we present, in one place: the investor room (film, animated deck,
// documents), the animated deck on its own for presenting, and the brand film and deck (/decks). The whole site is
// behind the site passcode (middleware.ts), and that passcode also opens /investors and /decks, so nothing here asks
// again. The posters are private files, served only to visitors who have unlocked the site.
import { Link } from 'expo-router';
import React from 'react';
import { Pressable, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Container, Eyebrow, Photo, Serif, T, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import { colors } from '@/theme';

type Item = { title: Key; body: Key; open: Key; href: string; poster: string; external?: boolean };
const ITEMS: Item[] = [
  { title: 'presInvTitle', body: 'presInvBody', open: 'presInvOpen', href: '/investors', poster: '/investors/film/poster.jpg' },
  { title: 'presDeckTitle', body: 'presDeckBody', open: 'presDeckOpen', href: '/investors/deck', poster: '/investors/deck/cover.jpg', external: true },
  { title: 'presDeckArTitle', body: 'presDeckArBody', open: 'presDeckArOpen', href: '/investors/deck-ar', poster: '/investors/deck-ar/cover.jpg', external: true },
  { title: 'presBrandTitle', body: 'presBrandBody', open: 'presBrandOpen', href: '/decks', poster: '/decks/film/poster.jpg' },
];

function Card({ it }: { it: Item }) {
  const { t } = useI18n();
  const inner = (
    <Pressable accessibilityRole="link" {...{ dataSet: { hover: 'door' } }} style={{ gap: 14, flexGrow: 1, flexBasis: 420 }}>
      <Photo uri={it.poster} ratio={16 / 9} tone={colors.sand} label={t(it.title)} />
      <Serif size={26}>{t(it.title)}</Serif>
      <T size={14.5} lh={1.65} color={colors.body}>{t(it.body)}</T>
      <T w={600} size={11.5} caps color={colors.emerald}>{t(it.open)}</T>
    </Pressable>
  );
  // The animated deck is a static page outside the app router: open it as a plain link.
  return it.external ? <a href={it.href} style={{ textDecoration: 'none', display: 'flex', flexGrow: 1, flexBasis: 420 }}>{inner}</a> : <Link href={it.href as never} asChild>{inner}</Link>;
}

export default function Presentations() {
  const { t } = useI18n();
  const wide = useWide();
  return (
    <Screen>
      <Seo title={t('presTitle')} description={t('presBody')} path="/presentations" noindex />
      <Container style={{ paddingTop: wide ? 48 : 24, paddingBottom: 24 }}>
        <Eyebrow rule>{t('presKicker')}</Eyebrow>
        <Serif role="h1" size={wide ? 54 : 38} style={{ marginTop: 14 }}>{t('presTitle')}</Serif>
        <T size={wide ? 17 : 15.5} lh={1.7} color={colors.body} style={{ maxWidth: 620, marginTop: 14 }}>{t('presBody')}</T>
        <View style={{ flexDirection: wide ? 'row' : 'column', flexWrap: 'wrap', gap: wide ? 36 : 40, marginTop: 44 }}>
          {ITEMS.map((it) => <Card key={it.title} it={it} />)}
        </View>
      </Container>
    </Screen>
  );
}
