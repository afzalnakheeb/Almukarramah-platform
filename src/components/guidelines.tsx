// The seller guidelines, laid out for reading: allowed (gold ticks), not allowed (red crosses), photo and quality rules.
import React from 'react';
import { View } from 'react-native';
import { GUIDE_SECTIONS, type GuideSection } from '@/lib/guidelines';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';
import { Icon } from './icons';
import { Card, Serif, T, useWide } from './ui';

function Section({ s }: { s: GuideSection }) {
  const { lang } = useI18n();
  const wide = useWide();
  const bad = s.id === 'not-allowed';
  return (
    <Card pad={wide ? 26 : 16} style={{ gap: 12, borderRadius: 22, borderColor: bad ? '#E9C7C2' : colors.champagne, backgroundColor: bad ? '#FFF9F8' : colors.white }}>
      <View nativeID={s.id} />
      <Serif role="h2" size={wide ? 32 : 26} color={bad ? colors.danger : colors.navy}>{s.title[lang]}</Serif>
      {s.intro ? <T size={14.5} lh={1.6} color={colors.body}>{s.intro[lang]}</T> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {s.items.map((it) => (
          <View key={it.t.en} style={{ flexGrow: 1, flexBasis: wide ? 320 : '100%', flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 6 }}>
            <View style={{ width: 26, height: 26, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: bad ? colors.dangerBg : colors.goldSoft, marginTop: 1 }}>
              <Icon name={bad ? 'close' : 'check'} size={15} color={bad ? colors.danger : colors.brassText} stroke={2.2} />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <T w={700} size={15} color={colors.navy}>{it.t[lang]}</T>
              {it.d ? <T size={13.5} lh={1.55} color={colors.body}>{it.d[lang]}</T> : null}
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function GuidelinesView() {
  return (
    <View style={{ gap: 16 }}>
      {GUIDE_SECTIONS.map((s) => <Section key={s.id} s={s} />)}
    </View>
  );
}
