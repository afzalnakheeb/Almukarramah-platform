// Gift assistant page. Desktop: the invitation on the start side (title, what it does in three numbered lines) and the
// conversation beside it in a hairline frame. Phones: the head, then the conversation.
import React from 'react';
import { View } from 'react-native';
import { AssistantChat } from '@/components/assistant';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Eyebrow, H1, KiswahRule, Serif, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export default function Concierge() {
  const wide = useWide();
  const { t } = useI18n();
  const steps = ['conciergeStep1', 'conciergeStep2', 'conciergeStep3'] as const;
  const head = (
    <View style={{ gap: wide ? 16 : 10, alignItems: wide ? 'flex-start' : 'center' }}>
      <Eyebrow rule={wide} center={!wide}>{t('conciergeKicker')}</Eyebrow>
      <H1 size={wide ? 56 : 36} center={!wide}>{t('concierge')}</H1>
      {!wide && <KiswahRule center width={88} />}
      <T size={wide ? 16.5 : 14.5} lh={1.65} color={colors.body} center={!wide} style={{ maxWidth: 440 }}>{t('conciergeSub')}</T>
    </View>
  );
  const chat = (
    <View style={{ height: wide ? 640 : 560, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderTopColor: colors.gold, backgroundColor: colors.ivory }}>
      <AssistantChat />
    </View>
  );
  return (
    <Screen>
      <Seo title="Gift assistant | Al Mukarramah" description="Tell the Al Mukarramah assistant who the gift is for, the occasion and your budget, and it suggests gifts from the current catalogue, writes your gift card message and helps with delivery." path="/concierge" />
      {wide ? (
        <View style={{ flexDirection: 'row', gap: 88, alignItems: 'center', maxWidth: 1120, width: '100%', alignSelf: 'center', paddingTop: 8 }}>
          <View style={{ flex: 0.85, gap: 40 }}>
            {head}
            <View style={{ borderTopWidth: 1, borderColor: colors.goldLine }}>
              {steps.map((k, i) => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 18, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.line }}>
                  <Serif size={22} color={colors.brassText} style={{ width: 28 }}>{`0${i + 1}`}</Serif>
                  <T size={14.5} lh={1.55} color={colors.navy} style={{ flex: 1 }}>{t(k)}</T>
                </View>
              ))}
            </View>
            <T size={12} lh={1.6} color={colors.muted}>{t('conciergeNote')}</T>
          </View>
          <View style={{ flex: 1.15 }}>{chat}</View>
        </View>
      ) : (
        <View style={{ gap: 24 }}>
          {head}
          {chat}
          <T size={12} lh={1.6} color={colors.muted} center>{t('conciergeNote')}</T>
        </View>
      )}
    </Screen>
  );
}
