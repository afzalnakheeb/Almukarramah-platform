// The Al Mukarramah Islamic standard: prohibited, restricted (our team decides, confirmed by our scholar) and allowed.
import React from 'react';
import { View } from 'react-native';
import { GuideLayout } from '@/components/guidelines';
import { CapsLink, Notice, Serif, T, Tag, useWide } from '@/components/ui';
import { GUIDE_PAGES, ISLAMIC_LEVELS, ISLAMIC_NOTE } from '@/lib/guidelines';
import { useI18n } from '@/lib/i18n';
import { useGuidance } from '@/lib/market';
import { colors } from '@/theme';

export default function IslamicStandard() {
  const { t, lang } = useI18n();
  const wide = useWide();
  const g = useGuidance();
  const page = GUIDE_PAGES.find((p) => p.id === 'islamic')!;
  const list = (level: 'prohibited' | 'restricted') => g.rules.filter((r) => r.level === level);
  const tone = { prohibited: colors.danger, restricted: colors.brass, allowed: colors.emerald } as const;
  return (
    <GuideLayout page="islamic" title={page.title[lang]} intro={page.line[lang]}
      seoTitle="The Al Mukarramah Islamic standard | Seller handbook"
      seoDescription="The three levels every product on Al Mukarramah is held to: prohibited, restricted for our team to decide with our scholar, and allowed.">
      <Notice text={ISLAMIC_NOTE[lang]} />
      <View style={{ gap: wide ? 0 : 6 }}>
        {ISLAMIC_LEVELS.map((lv) => (
          <View key={lv.level} style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 40 : 10, paddingVertical: wide ? 28 : 20, borderTopWidth: 1, borderColor: colors.line }}>
            <View style={{ width: wide ? 220 : undefined, gap: 10 }}>
              <View style={{ height: 2, width: 28, backgroundColor: tone[lv.level] }} />
              <Serif role="h2" size={wide ? 32 : 26}>{lv.title[lang]}</Serif>
            </View>
            <View style={{ flex: 1, gap: 14 }}>
              <T size={15} lh={1.7} color={colors.body}>{lv.body[lang]}</T>
              {lv.level !== 'allowed' ? (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {list(lv.level).map((r) => <Tag key={r.code} label={lang === 'ar' ? r.title_ar : r.title_en} tone={lv.level === 'prohibited' ? 'err' : 'warn'} />)}
                  </View>
                  <CapsLink label={GUIDE_PAGES.find((p) => p.id === 'prohibited')!.title[lang]} href="/sell/prohibited" />
                </>
              ) : null}
            </View>
          </View>
        ))}
      </View>
      <T size={13.5} lh={1.6} color={colors.muted}>{t('mkScholarPending')}: {list('restricted').filter((r) => r.needs_scholar_confirmation).map((r) => (lang === 'ar' ? r.title_ar : r.title_en)).join(lang === 'ar' ? '، ' : ', ')}</T>
    </GuideLayout>
  );
}
