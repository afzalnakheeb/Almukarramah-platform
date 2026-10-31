// A refund whose Moyasar answer never came (a timeout, a dropped connection, a 5xx page) stays "processing": it is
// never marked failed on a guess and never retried blind, because Moyasar may have made it (review H2). It is settled
// by reading the payment back from Moyasar: the payment's refunded total, less what we have recorded as refunded for
// the order, is either this refund's amount (it went through), nothing (it did not, once the grace period has passed),
// or something else (a refund made outside the platform: left for finance). Only one refund per order can be waiting
// at a time (refunds_one_processing), so the arithmetic is never ambiguous.
import { getPayment } from './moyasar.ts';
import type { Db } from './util.ts';
import { issueCreditNote } from './zatca.ts';

export type Reconciled = {
  refund: string;
  state: 'succeeded' | 'failed' | 'waiting' | 'mismatch' | 'not_processing' | 'unreachable';
  detail?: string;
  creditNote?: string | null;
};

type RefundState = { id: string; status: string; payment_id: string | null; amount_minor: number; order_refunded_minor: number; age_seconds: number; order_id: string };

export const graceMinutes = (env: (k: string) => string | undefined) => {
  const v = Number(env('REFUND_RECONCILE_GRACE_MINUTES'));
  return Number.isFinite(v) && v >= 0 ? v : 15;
};

export async function reconcileRefund(db: Db, refundId: string, grace: number): Promise<Reconciled> {
  const { data, error } = await db.rpc('mp_refund_state', { p_refund: refundId });
  if (error) throw error;
  const f = data as RefundState | null;
  if (!f) throw new Error('Refund not found');
  if (f.status !== 'processing') return { refund: f.id, state: 'not_processing', detail: f.status };
  if (!f.payment_id) return { refund: f.id, state: 'mismatch', detail: 'the order has no payment' };
  let refunded: number;
  let payId: string;
  try {
    const pay = await getPayment(f.payment_id);
    refunded = Number(pay.refunded ?? 0);
    payId = pay.id;
  } catch (e) {
    return { refund: f.id, state: 'unreachable', detail: (e as Error).message };
  }
  // what Moyasar shows is noted: the refunds page lists money Moyasar refunded that we have not recorded (R3-2)
  await db.rpc('mp_note_moyasar_refunded', { p_order: f.order_id, p_refunded: refunded });
  const extra = refunded - f.order_refunded_minor;
  if (extra === f.amount_minor) {
    const { error: e2 } = await db.rpc('mp_complete_refund', { p_refund: f.id, p_ok: true, p_provider_ref: `${payId}:${f.amount_minor}:reconciled`, p_error: null });
    if (e2) throw e2;
    let creditNote: string | null = null;
    try {
      creditNote = (await issueCreditNote(db, f.id))?.number ?? null;
    } catch (e) {
      console.error('credit note left pending', f.id, e);   // finish-pending issues it later
    }
    return { refund: f.id, state: 'succeeded', creditNote };
  }
  if (extra === 0) {
    if (f.age_seconds >= grace * 60) {
      const { error: e3 } = await db.rpc('mp_complete_refund', {
        p_refund: f.id, p_ok: false, p_provider_ref: null,
        p_error: `Moyasar shows no refund for this ${Math.round(f.age_seconds / 60)} minutes after it was asked (checked with Moyasar)`,
      });
      if (e3) throw e3;
      return { refund: f.id, state: 'failed' };
    }
    return { refund: f.id, state: 'waiting', detail: 'Moyasar shows no refund yet' };
  }
  await db.from('audit_log').insert({
    actor_label: 'refund-reconcile', table_name: 'refunds', row_id: f.id, action: 'REFUND_MISMATCH',
    new_data: { moyasar_refunded: refunded, recorded: f.order_refunded_minor, this_refund: f.amount_minor },
  });
  return { refund: f.id, state: 'mismatch', detail: `Moyasar has refunded ${refunded}; we have recorded ${f.order_refunded_minor} and this refund is ${f.amount_minor}` };
}
