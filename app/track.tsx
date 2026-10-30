// Parcel tracking by number (the link on labels and in emails). Shows the parcel's progress only: statuses, times and
// places, never a name or an address. Works once the marketplace is switched on; the screenshot build shows an example.
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, Card, Field, H1, Notice, T, Tag, useHydrated, useWide } from '@/components/ui';
import { trackParcel, type ParcelTrack } from '@/lib/aftersale';
import { useI18n, type Key } from '@/lib/i18n';
import { colors } from '@/theme';

export default function Track() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const hydrated = useHydrated();
  const params = useLocalSearchParams<{ number?: string }>();
  const [number, setNumber] = useState('');
  const [res, setRes] = useState<ParcelTrack | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const look = async (n: string) => {
    if (!/^[A-Za-z0-9-]{6,40}$/.test(n.trim())) { setRes(null); return; }
    setBusy(true);
    try { setRes(await trackParcel(n.trim())); } catch { setRes(null); } finally { setBusy(false); }
  };
  useEffect(() => { if (hydrated && params.number) { setNumber(params.number); look(params.number); } }, [hydrated, params.number]);
  const when = (s: string) => new Date(s).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return (
    <Screen style={{ maxWidth: 760 }}>
      <Seo title="Track a parcel | Al Mukarramah" description="Follow your parcel." path="/track" noindex />
      <H1 size={wide ? 44 : 32}>{t('tkTitle')}</H1>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginBottom: 14 }}>{t('tkIntro')}</T>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10, alignItems: wide ? 'flex-end' : 'stretch' }}>
        <View style={{ flex: 1 }}><Field label={t('tkNumber')} value={number} onChangeText={setNumber} autoCapitalize="characters" dirLtr /></View>
        <Button label={t('tkFind')} busy={busy} disabled={!number.trim()} onPress={() => look(number)} style={{ marginBottom: wide ? 18 : 0 }} />
      </View>
      {res === null ? <Notice tone="warn" text={t('tkNotFound')} /> : null}
      {res ? (
        <Card pad={wide ? 22 : 16} style={{ gap: 10, marginTop: 8 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <T w={700} size={16} num>{res.tracking_number}</T>
            <Tag label={t(`tk_${res.status}` as Key)} tone={res.status === 'delivered' ? 'ok' : res.status === 'failed' || res.status === 'returned' ? 'err' : 'info'} />
          </View>
          {res.carrier ? <T size={13} color={colors.muted}>{res.carrier}</T> : null}
          {res.status !== 'delivered' && res.expected_to ? <T size={13.5}>{t('tkExpected')} {new Date(`${res.expected_to}T12:00:00Z`).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'long' })}</T> : null}
          {res.events.map((e, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 12, borderTopWidth: 1, borderColor: colors.lineSoft, paddingTop: 8 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, marginTop: 5, backgroundColor: i ? colors.line : colors.emerald }} />
              <View style={{ flex: 1, gap: 2 }}>
                <T size={14} w={i ? 500 : 700}>{(lang === 'ar' ? e.ar : e.en) ?? e.status}</T>
                <T size={12.5} color={colors.muted}>{when(e.at)}{e.location ? ` · ${e.location}` : ''}</T>
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
