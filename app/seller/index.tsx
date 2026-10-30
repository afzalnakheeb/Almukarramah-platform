// Seller dashboard home: account status, what to do next, and listing counts.
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Ornament } from '@/components/decor';
import { Seo } from '@/components/seo';
import { Button, Card, Notice, Serif, T, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import { myListings, mySellerFile, type Checklist, type Listing } from '@/lib/seller';
import { useSeller } from '@/lib/seller-context';
import { colors } from '@/theme';

export default function SellerHome() {
  const wide = useWide();
  const { t } = useI18n();
  const { me } = useSeller();
  const s = me.seller;
  const [rows, setRows] = useState<Listing[] | null>(null);
  const [check, setCheck] = useState<Checklist | null>(null);
  useEffect(() => { myListings(s.id).then(setRows).catch(() => setRows([])); }, [s.id]);
  useEffect(() => { if (s.status !== 'approved') mySellerFile(s.id).then((f) => setCheck(f.checklist)).catch(() => setCheck(null)); }, [s.id, s.status]);
  const count = (st: Listing['listing_status']) => (rows ?? []).filter((r) => r.listing_status === st).length;

  const statusText: Record<string, Key> = { pending: 'sdPendingBody', info_requested: 'sdInfoRequestedBody', approved: 'sdApprovedBody', rejected: 'sdRejectedBody', suspended: 'sdSuspendedBody' };

  return (
    <Screen chrome="none" style={{ maxWidth: 1100 }}>
      <Seo title="Seller dashboard | Al Mukarramah" description="Seller dashboard." path="/seller" noindex />
      <Serif role="h1" size={wide ? 44 : 32}>{t('sdWelcome')} {s.name_en}</Serif>
      <Ornament color={colors.brass} width={84} style={{ marginVertical: 10 }} />

      <Card pad={wide ? 24 : 16} style={{ gap: 8, borderColor: s.status === 'approved' ? colors.champagne : colors.line, backgroundColor: s.status === 'approved' ? colors.white : colors.goldSoft }}>
        <T w={700} size={16} color={colors.navy}>{t(`sellerStatus_${s.status}` as Key)}</T>
        <T size={14} lh={1.6} color={colors.body}>{t(statusText[s.status])}</T>
        {s.review_note ? <Notice text={s.review_note} tone={s.status === 'approved' ? 'ok' : 'warn'} /> : null}
        {check && (s.status === 'pending' || s.status === 'info_requested') ? (
          <View style={{ gap: 8, marginTop: 4 }}>
            <View style={{ height: 4, backgroundColor: colors.lineSoft }}>
              <View style={{ height: 4, width: `${Math.round((100 * check.items.filter((x) => x.done).length) / Math.max(1, check.items.length))}%`, backgroundColor: colors.emerald }} />
            </View>
            <T size={13} color={colors.muted}>{t('sdFileProgress').replace('{done}', String(check.items.filter((x) => x.done).length)).replace('{total}', String(check.items.length))}</T>
            <Button label={t(check.submitted_at && s.status === 'pending' ? 'sdApplication' : 'sdCompleteFile')} href="/seller/application" style={{ alignSelf: 'flex-start' }} />
          </View>
        ) : null}
      </Card>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
        {([['approved', 'sdLive'], ['pending_review', 'sdWaiting'], ['draft', 'sdDrafts'], ['rejected', 'sdRejected']] as [Listing['listing_status'], Key][]).map(([st, label]) => (
          <Card key={st} pad={16} style={{ flexGrow: 1, flexBasis: wide ? 180 : '45%', gap: 2 }}>
            <Serif size={36} color={colors.navy}>{rows ? count(st) : '–'}</Serif>
            <T size={13} color={colors.muted}>{t(label)}</T>
          </Card>
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 20 }}>
        <Button label={t('sdAddProduct')} href="/seller/product" disabled={s.status !== 'approved'} />
        <Button label={t('sdOrders')} kind="secondary" href="/seller/orders" />
        <Button label={t('sdShop')} kind="secondary" href="/seller/shop" />
      </View>
      {s.status !== 'approved' && <T size={13} color={colors.muted} style={{ marginTop: 8 }}>{t('sdAddAfterApproval')}</T>}

      <Card pad={wide ? 24 : 16} style={{ marginTop: 24, gap: 8, backgroundColor: colors.night, borderColor: colors.gold }}>
        <T w={700} size={16} color={colors.goldBright}>{t('sdHowItWorks')}</T>
        {(['sdHow1', 'sdHow2', 'sdHow3', 'sdHow4'] as Key[]).map((k) => (
          <View key={k} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: 6, height: 6, backgroundColor: colors.gold, transform: [{ rotate: '45deg' }], marginTop: 8 }} />
            <T size={14} lh={1.6} color={colors.onNight} style={{ flex: 1 }}>{t(k)}</T>
          </View>
        ))}
        <Button label={t('sellerGuidelines')} kind="outlineLight" size="sm" href="/sell/guidelines" style={{ alignSelf: 'flex-start', marginTop: 6 }} />
      </Card>
    </Screen>
  );
}
