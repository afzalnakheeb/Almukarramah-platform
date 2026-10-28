import { Link, router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Field, H1, Notice, Screen, Section } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/lib/session';
import { isConfigured, supabase } from '@/lib/supabase';
import { colors, radius, space, type } from '@/theme';

type OrderRow = { id: string; number: number; status: string; currency: string; total_minor: number; created_at: string; invoices: { id: string; number: string }[] };

export default function Account() {
  const { t, lang } = useI18n();
  const { session, staffRole } = useSession();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [orders, setOrders] = useState<OrderRow[]>([]);

  useEffect(() => {
    if (!session) return;
    supabase
      .from('orders')
      .select('id, number, status, currency, total_minor, created_at, invoices(id, number)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setOrders((data as OrderRow[]) ?? []));
  }, [session]);

  if (!session) {
    return (
      <Screen>
        <H1>{t('signIn')}</H1>
        {!isConfigured && <Notice text="Preview mode: sign-in works once the Supabase project is connected." />}
        <Field label={t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Button
          label={t('sendCode')}
          onPress={async () => {
            await supabase.auth.signInWithOtp({ email });
            setSent(true);
          }}
        />
        {sent && <Notice text={t('checkEmail')} />}
      </Screen>
    );
  }

  return (
    <Screen>
      <H1>{t('account')}</H1>
      <Text style={type.small}>{session.user.email}</Text>

      <Section title={t('myOrders')}>
        {orders.map((o) => (
          <View key={o.id} style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space(2), marginBottom: space(1) }}>
            <Text style={[type.body, { fontWeight: '600' }]}>AM-{o.number} · {o.status}</Text>
            <Text style={type.small}>{new Date(o.created_at).toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-GB')} · {formatMoney(o.total_minor, o.currency, lang)}</Text>
            {o.invoices?.[0] && <Text style={[type.small, { marginTop: 4 }]}>{t('invoice')}: {o.invoices[0].number}</Text>}
          </View>
        ))}
      </Section>

      <Section title={t('membership')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(1) }}>
          <Button label={t('membership')} kind="secondary" onPress={() => router.push('/membership')} />
          <Button label={t('quranTrail')} kind="secondary" onPress={() => router.push({ pathname: '/trail/[slug]', params: { slug: 'quran-trail' } })} />
          <Button label={t('seerahTrail')} kind="secondary" onPress={() => router.push({ pathname: '/trail/[slug]', params: { slug: 'seerah-trail' } })} />
        </View>
      </Section>

      {staffRole && (
        <Section title={t('admin')}>
          <Link href="/admin" style={{ color: colors.navy, fontWeight: '700' }}>{t('admin')} →</Link>
        </Section>
      )}

      <Button label={t('signOut')} kind="secondary" style={{ marginTop: space(4) }} onPress={() => supabase.auth.signOut()} />
    </Screen>
  );
}
