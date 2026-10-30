// The premium standard: who we accept, the listing quality score, the service we expect and the performance we watch.
import React from 'react';
import { View } from 'react-native';
import { GuideLayout, GuideSectionView } from '@/components/guidelines';
import { Serif, T, useWide } from '@/components/ui';
import { GUIDE_PAGES, PREMIUM } from '@/lib/guidelines';
import { useI18n, type Key } from '@/lib/i18n';
import { percent, useGuidance } from '@/lib/market';
import { colors } from '@/theme';

export default function PremiumStandard() {
  const { t, lang } = useI18n();
  const wide = useWide();
  const g = useGuidance();
  const page = GUIDE_PAGES.find((p) => p.id === 'premium')!;
  const th = g.settings.perf_thresholds;
  const rows: [Key, string, string][] = th ? [
    ['mkPerfLate', percent(th.late_shipment_bps.warn), percent(th.late_shipment_bps.suspend)],
    ['mkPerfCancel', percent(th.cancellation_bps.warn), percent(th.cancellation_bps.suspend)],
    ['mkPerfReturns', percent(th.return_bps.warn), percent(th.return_bps.suspend)],
    ['mkPerfRating', (th.rating_x100.warn / 100).toFixed(1), (th.rating_x100.suspend / 100).toFixed(1)],
  ] : [];
  const cell = { flex: 1, paddingVertical: 12 } as const;
  return (
    <GuideLayout page="premium" title={page.title[lang]} intro={page.line[lang]}
      seoTitle="The premium standard | Al Mukarramah seller handbook"
      seoDescription="Seller vetting, the listing quality score, photo and content standards, service and the performance thresholds every Al Mukarramah seller keeps to.">
      {PREMIUM.map((s, i) => <GuideSectionView key={s.id} s={s} n={i + 1} />)}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
        <T w={600} size={10.5} caps color={colors.navy}>{t('mkMinQuality')}</T>
        <Serif size={wide ? 34 : 28}>{g.settings.min_quality_score}</Serif>
        <T size={13} color={colors.muted}>/ 100</T>
      </View>
      {rows.length ? (
        <View style={{ gap: 10 }}>
          <Serif role="h2" size={wide ? 32 : 25}>{t('mkPerformance')}</Serif>
          <T size={14.5} lh={1.65} color={colors.body}>{t('mkPerfIntro')}</T>
          <View style={{ borderTopWidth: 1, borderColor: colors.goldLine }}>
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.line }}>
              <View style={[cell, { flex: 2 }]} />
              <T w={600} size={10.5} caps color={colors.muted} style={cell}>{t('mkPerfWarn')}</T>
              <T w={600} size={10.5} caps color={colors.muted} style={cell}>{t('mkPerfReview')}</T>
            </View>
            {rows.map(([k, a, b]) => (
              <View key={k} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: colors.lineSoft }}>
                <T size={14} color={colors.ink} style={[cell, { flex: 2 }]}>{t(k)}</T>
                <T size={14} num color={colors.ink} style={cell}>{a}</T>
                <T size={14} num color={colors.ink} style={cell}>{b}</T>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </GuideLayout>
  );
}
