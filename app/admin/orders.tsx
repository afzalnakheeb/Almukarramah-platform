import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Button, Chip, H1, Notice, T } from '@/components/ui';
import { formatMoney } from '@/lib/money';
import { callFunction, supabase } from '@/lib/supabase';
import { colors, radius, space, type } from '@/theme';

type Order = {
  id: string; number: number; status: string; currency: string; total_minor: number; created_at: string; email: string | null;
  ship_to: { recipient_name: string; city: string; country: string; kind: string; hotel_name?: string };
  invoices: { number: string; zatca_status: string; doc: string }[];
};

const STATUSES = ['paid', 'packing', 'shipped', 'delivered'] as const;

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<string>('paid');
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from('orders')
      .select('id, number, status, currency, total_minor, created_at, email, ship_to, invoices(number, zatca_status, doc)')
      .eq('status', filter)
      .order('created_at', { ascending: false })
      .limit(100);
    setOrders((data as Order[]) ?? []);
  }
  useEffect(() => {
    load();
  }, [filter]);

  async function setStatus(o: Order, status: string) {
    await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', o.id);
    load();
  }

  async function refund(o: Order) {
    // Refunds go through a server function: it refunds in Moyasar and issues a ZATCA credit note.
    try {
      await callFunction('refund-order', { orderId: o.id, reason: 'Refund from admin panel' });
      setMsg(`Refund started for AM-${o.number}`);
      load();
    } catch (e) {
      setMsg(String(e));
    }
  }

  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <H1>Orders</H1>
      <View style={{ flexDirection: 'row', gap: space(1), flexWrap: 'wrap', marginBottom: space(2) }}>
        {[...STATUSES, 'pending_payment', 'refunded'].map((s) => <Chip key={s} label={s} active={filter === s} onPress={() => setFilter(s)} />)}
      </View>
      {msg && <Notice text={msg} />}
      {orders.map((o) => (
        <View key={o.id} style={{ backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: space(2.5), marginBottom: space(1.5) }}>
          <T w={700}>AM-{o.number} · {formatMoney(o.total_minor, o.currency)}</T>
          <T size={13} color={colors.muted}>
            {o.ship_to.recipient_name} · {o.ship_to.kind === 'hotel' ? `${o.ship_to.hotel_name}, ` : ''}{o.ship_to.city}, {o.ship_to.country} · {new Date(o.created_at).toLocaleString('en-GB')}
          </T>
          {o.invoices.map((i) => (
            <T key={i.number} size={13} color={colors.muted}>{i.doc} {i.number} · ZATCA: {i.zatca_status}</T>
          ))}
          <View style={{ flexDirection: 'row', gap: space(1), flexWrap: 'wrap', marginTop: space(1) }}>
            {STATUSES.filter((s) => s !== o.status).map((s) => <Chip key={s} label={`→ ${s}`} onPress={() => setStatus(o, s)} />)}
            {o.status !== 'refunded' && o.status !== 'pending_payment' && <Button kind="danger" label="Refund" onPress={() => refund(o)} />}
          </View>
        </View>
      ))}
    </Screen>
  );
}
