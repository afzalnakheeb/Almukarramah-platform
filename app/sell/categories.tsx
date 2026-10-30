// What you can sell: every category in the tree with what it needs (details, documents, photos, returns, shipping).
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { DepartmentBlock, GuideLayout } from '@/components/guidelines';
import { Icon } from '@/components/icons';
import { T } from '@/components/ui';
import { GUIDE_PAGES } from '@/lib/guidelines';
import { useI18n } from '@/lib/i18n';
import { departments, leavesUnder, useGuidance } from '@/lib/market';
import { colors, sans } from '@/theme';

export default function WhatYouCanSell() {
  const { t, lang, isRTL } = useI18n();
  const g = useGuidance();
  const [q, setQ] = useState('');
  const page = GUIDE_PAGES.find((p) => p.id === 'categories')!;
  const depts = departments(g);
  const any = depts.some((d) => leavesUnder(g, d).some((c) => c.listable && `${c.name_en} ${c.name_ar} ${d.name_en} ${d.name_ar}`.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <GuideLayout page="categories" title={page.title[lang]} intro={page.line[lang]}
      seoTitle="What you can sell | Al Mukarramah seller handbook"
      seoDescription="Al Mukarramah's categories for a Muslim home and what each needs: product details, documents and permits, photos, returns, shipping and commission.">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderColor: colors.goldLine, maxWidth: 520 }}>
        <Icon name="search" size={18} stroke={1.3} />
        <TextInput value={q} onChangeText={setQ} placeholder={t('mkFindCategory')} placeholderTextColor={colors.muted} accessibilityLabel={t('mkFindCategory')}
          style={[sans(400, isRTL), { flex: 1, minHeight: 44, fontSize: 15, color: colors.ink, textAlign: isRTL ? 'right' : 'left' }]} />
      </View>
      {depts.map((d) => <DepartmentBlock key={d.id} g={g} dept={d} filter={q} />)}
      {!any ? <T color={colors.muted}>{t('mkNoMatch')}</T> : null}
    </GuideLayout>
  );
}
