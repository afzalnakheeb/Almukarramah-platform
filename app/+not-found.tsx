// Any address that does not exist: the Kiswah mark, one calm line and the way back.
import React from 'react';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Button, EmptyState } from '@/components/ui';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <Screen>
      <Seo title="Page not found | Al Mukarramah" description={t('pageNotFoundBody')} path="/404" noindex />
      <EmptyState h1 title={t('pageNotFoundTitle')} body={t('pageNotFoundBody')}>
        <Button label={t('goHome')} href="/" />
        <Button label={t('allGifts')} href="/shop" kind="quiet" />
      </EmptyState>
    </Screen>
  );
}
