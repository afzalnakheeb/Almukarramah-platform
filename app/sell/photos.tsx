// Photo guidelines: the product itself, large and clean, no people, nothing written on top.
import React from 'react';
import { GuideLayout, GuideSectionView } from '@/components/guidelines';
import { Notice } from '@/components/ui';
import { GUIDE_PAGES, PHOTO_RULES } from '@/lib/guidelines';
import { useI18n } from '@/lib/i18n';
import { useGuidance } from '@/lib/market';

export default function PhotoGuidelines() {
  const { lang } = useI18n();
  const g = useGuidance();
  const page = GUIDE_PAGES.find((p) => p.id === 'photos')!;
  return (
    <GuideLayout page="photos" title={page.title[lang]} intro={page.line[lang]}
      seoTitle="Photo guidelines | Al Mukarramah seller handbook"
      seoDescription="Product photos on Al Mukarramah: at least 1600 px, clean or premium backgrounds, no people or models, no watermarks, text, prices or contact details.">
      {g.settings.allow_modest_models_in_fashion ? (
        <Notice text={lang === 'ar' ? 'في الأزياء المحتشمة يُسمح حاليًا بعارضين بلباس محتشم، ويراجع فريقنا كل صورة.' : 'In modest fashion, modestly dressed models are currently allowed; our team reviews every photo.'} />
      ) : null}
      {PHOTO_RULES.map((s) => <GuideSectionView key={s.id} s={s} />)}
    </GuideLayout>
  );
}
