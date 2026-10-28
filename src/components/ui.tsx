import { Image } from 'expo-image';
import { Link } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '@/lib/i18n';
import { formatMoney, priceIn } from '@/lib/money';
import type { Product } from '@/lib/types';
import { colors, radius, space, type } from '@/theme';

export function Screen({ children, scroll = true }: { children: React.ReactNode; scroll?: boolean }) {
  const body = <View style={styles.inner}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: space(6) }}>{body}</ScrollView> : body}
    </SafeAreaView>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={[type.display, { marginBottom: space(1) }]}>{children}</Text>;
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: space(4) }}>
      <Text style={[type.title, { marginBottom: space(2) }]}>{title}</Text>
      {children}
    </View>
  );
}

export function Button({ label, onPress, kind = 'primary', disabled, busy, style }: {
  label: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; busy?: boolean; style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? colors.navy : kind === 'danger' ? colors.danger : colors.white;
  const fg = kind === 'secondary' ? colors.navy : colors.white;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={[styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : 1, borderColor: kind === 'secondary' ? colors.navy : bg }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{label}</Text>}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  const { isRTL } = useI18n();
  return (
    <View style={{ marginBottom: space(1.5) }}>
      <Text style={[type.small, { marginBottom: 4, fontWeight: '600' }]}>{props.label}</Text>
      <TextInput placeholderTextColor={colors.muted} {...props} style={[styles.input, { textAlign: isRTL ? 'right' : 'left' }, props.style]} />
    </View>
  );
}

export function Price({ product, style }: { product: Product; style?: object }) {
  const { currency, lang } = useI18n();
  return <Text style={[{ fontWeight: '700', color: colors.navy }, style]}>{formatMoney(priceIn(product, currency), currency, lang)}</Text>;
}

export function ProductCard({ product }: { product: Product }) {
  const { pick } = useI18n();
  return (
    <Link href={{ pathname: '/product/[slug]', params: { slug: product.slug } }} asChild>
      <Pressable style={styles.card} accessibilityRole="link">
        <Image source={product.images[0] ? { uri: product.images[0] } : require('../../assets/logo.png')} style={styles.cardImage} contentFit={product.images[0] ? 'cover' : 'contain'} />
        <Text numberOfLines={2} style={[type.body, { fontWeight: '600', marginTop: space(1) }]}>{pick(product, 'name')}</Text>
        <Price product={product} style={{ marginTop: 4 }} />
      </Pressable>
    </Link>
  );
}

export function Grid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

export function Chip({ label, onPress, active }: { label: string; onPress?: () => void; active?: boolean }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && { backgroundColor: colors.navy, borderColor: colors.navy }]}>
      <Text style={{ color: active ? colors.white : colors.navy, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function Loading() {
  return <ActivityIndicator style={{ marginTop: space(6) }} color={colors.navy} />;
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warn' }) {
  return (
    <View style={[styles.notice, tone === 'warn' && { backgroundColor: '#FBE9E7' }]}>
      <Text style={[type.body, tone === 'warn' && { color: colors.danger }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  inner: { paddingHorizontal: space(2), paddingTop: space(2), width: '100%', maxWidth: 1100, alignSelf: 'center' },
  button: { minHeight: 48, paddingHorizontal: space(3), borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  input: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: space(1.5), backgroundColor: colors.white, fontSize: 15, color: colors.ink },
  card: { width: 170, flexGrow: 1, maxWidth: 260, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: space(1.5) },
  cardImage: { width: '100%', aspectRatio: 1, borderRadius: radius.sm, backgroundColor: colors.sand },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2) },
  chip: { paddingHorizontal: space(2), minHeight: 40, justifyContent: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white },
  notice: { backgroundColor: colors.sand, borderRadius: radius.md, padding: space(2), marginVertical: space(1) },
});
