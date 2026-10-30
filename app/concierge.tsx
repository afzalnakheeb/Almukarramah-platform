// Gift assistant page: a centred head and the same conversation as the floating panel, in a hairline frame.
import React from 'react';
import { View } from 'react-native';
import { AssistantChat } from '@/components/assistant';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Eyebrow, H1, KiswahRule, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export default function Concierge() {
  const wide = useWide();
  const { t } = useI18n();
  return (
    <Screen>
      <Seo title="Gift assistant | Al Mukarramah" description="Tell the Al Mukarramah assistant who the gift is for, the occasion and your budget, and it suggests gifts from the current catalogue, writes your gift card message and helps with delivery." path="/concierge" />
      <View style={{ maxWidth: 780, width: '100%', alignSelf: 'center' }}>
        <View style={{ alignItems: 'center', gap: wide ? 14 : 10, marginBottom: wide ? 40 : 24, marginTop: wide ? 8 : 0 }}>
          <Eyebrow center>{t('conciergeKicker')}</Eyebrow>
          <H1 size={wide ? 56 : 36} center>{t('concierge')}</H1>
          <KiswahRule center width={wide ? 112 : 88} />
          <T size={wide ? 16 : 14.5} lh={1.6} color={colors.body} center style={{ maxWidth: 560, marginTop: 4 }}>{t('conciergeSub')}</T>
        </View>
        <View style={{ height: wide ? 620 : 560, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderTopColor: colors.gold, backgroundColor: colors.ivory }}>
          <AssistantChat />
        </View>
        <T size={12} lh={1.6} color={colors.muted} center style={{ marginTop: 14 }}>{t('conciergeNote')}</T>
      </View>
    </Screen>
  );
}
