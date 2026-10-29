// Gift assistant page — follows AppConcierge.dc.html. Same conversation as the floating "Ask Al Mukarramah" panel.
import React from 'react';
import { View } from 'react-native';
import { AssistantChat } from '@/components/assistant';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { H1, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export default function Concierge() {
  const wide = useWide();
  const { t } = useI18n();
  return (
    <Screen>
      <Seo title="Gift assistant | Al Mukarramah" description="Tell the Al Mukarramah assistant who the gift is for, the occasion and your budget, and it suggests gifts from the current catalogue, writes your gift card message and helps with delivery." path="/concierge" />
      <View style={{ maxWidth: 760, width: '100%', alignSelf: 'center' }}>
        <H1 size={wide ? 48 : 34}>{t('concierge')}</H1>
        <T color={colors.muted} style={{ marginBottom: 20 }}>{t('conciergeSub')}</T>
        <View style={{ height: wide ? 620 : 560, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white }}>
          <AssistantChat />
        </View>
        <T size={12.5} color={colors.muted} style={{ marginTop: 10 }}>{t('conciergeNote')}</T>
      </View>
    </Screen>
  );
}
