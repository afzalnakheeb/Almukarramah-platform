import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Button, H1, Notice, Screen } from '@/components/ui';
import { getPlans } from '@/lib/catalogue';
import { useI18n } from '@/lib/i18n';
import { convertFromSar, formatMoney } from '@/lib/money';
import { buyMembership, purchasesAvailable } from '@/lib/purchases';
import { useSession } from '@/lib/session';
import { callFunction } from '@/lib/supabase';
import type { Plan } from '@/lib/types';
import { colors, radius, space, type } from '@/theme';

export default function Membership() {
  const { t, pick, currency, lang } = useI18n();
  const { session } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getPlans().then(setPlans).catch(() => undefined);
  }, []);

  async function join(plan: Plan) {
    if (!session) return setMsg(t('signIn'));
    // Digital membership inside the iPhone/Android app must use app-store billing.
    if (plan.kind === 'membership' && Platform.OS !== 'web') {
      if (!purchasesAvailable()) return setMsg('App-store billing is available in the store build of the app.');
      await buyMembership();
      return setMsg('✓');
    }
    // Website membership and physical box clubs are paid through Moyasar (card saved for monthly renewal).
    const res = await callFunction<{ paymentUrl: string }>('create-payment', { planId: plan.id, lang });
    if (Platform.OS === 'web') window.location.href = res.paymentUrl;
    else await WebBrowser.openBrowserAsync(res.paymentUrl);
  }

  return (
    <Screen>
      <H1>{t('membership')}</H1>
      {msg && <Notice text={msg} />}
      {plans.map((p) => (
        <View key={p.id} style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space(3), marginBottom: space(2) }}>
          <Text style={type.title}>{pick(p, 'name')}</Text>
          <Text style={[type.body, { marginVertical: space(1) }]}>{pick(p, 'description')}</Text>
          <Text style={{ fontWeight: '700', color: colors.navy, fontSize: 18 }}>
            {formatMoney(convertFromSar(p.price_sar, currency), currency, lang)} {t('perMonth')}
          </Text>
          <Button label={t('join')} style={{ marginTop: space(2), alignSelf: 'flex-start' }} onPress={() => join(p)} />
        </View>
      ))}
    </Screen>
  );
}
