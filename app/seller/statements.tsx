// The seller's money: what can be paid out now, what is held for the return window, and each month's statement
// (sales, our commission, refunds, adjustments and the transfers we made). Payouts are bank transfers made by our
// finance team and recorded here; nothing on this page moves money.
import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { BalanceCards, StatementView } from '@/components/aftersale';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Loading, Notice, Serif, T, useWide } from '@/components/ui';
import { sellerStatement, type Statement } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { useI18n } from '@/lib/i18n';
import { useSeller } from '@/lib/seller-context';
import { colors } from '@/theme';

export default function SellerStatements() {
  const wide = useWide();
  const { t, lang } = useI18n();
  const { me } = useSeller();
  const [s, setS] = useState<Statement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback((m?: string) => sellerStatement(me.seller.id, m).then(setS).catch((e) => setErr(String(e.message ?? e))), [me.seller.id]);
  useEffect(() => { load(); }, [load]);
  return (
    <Screen chrome="none" style={{ maxWidth: 1080 }}>
      <Seo title="Statements | Seller | Al Mukarramah" description="Seller statements." path="/seller/statements" noindex />
      <Serif role="h1" size={wide ? 40 : 30}>{t('sdStatements')}</Serif>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginVertical: 8, maxWidth: 760 }}>{t('stIntro')}</T>
      {MARKET_DEMO ? <Notice text={t('lfDemo')} /> : null}
      {err ? <Notice tone="warn" text={err} /> : null}
      {!s && !err ? <Loading /> : null}
      {s ? (
        <View style={{ gap: 18 }}>
          <BalanceCards b={s.balance} lang={lang} />
          <StatementView s={s} onMonth={(m) => load(m)} />
        </View>
      ) : null}
    </Screen>
  );
}
