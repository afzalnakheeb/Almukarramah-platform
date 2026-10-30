// RevenueCat sends app-store subscription events here (membership bought inside the iPhone or Android app).
// In RevenueCat, set the webhook Authorization header to the REVENUECAT_WEBHOOK_AUTH secret. The app logs in to
// RevenueCat with the Supabase user id (src/lib/purchases.native.ts), so that id is the app user id or one of its aliases.
import { admin, env, json } from '../_shared/util.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RcEvent = {
  type: string; id: string; app_user_id?: string; original_app_user_id?: string; aliases?: string[];
  store?: string; original_transaction_id?: string; expiration_at_ms?: number | null;
};

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== env('REVENUECAT_WEBHOOK_AUTH')) return json({ error: 'unauthorised' }, 401);
  const { event } = (await req.json()) as { event: RcEvent };
  // A purchase made before signing in carries an anonymous RevenueCat id; the Supabase id is then among the aliases.
  const userId = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])].find((id) => !!id && UUID.test(id));
  if (!userId) return json({ ignored: 'no Supabase user id', type: event.type });

  const db = admin();
  // Deleted accounts: the store may still report on a subscription the customer has not cancelled yet.
  const { data: account } = await db.auth.admin.getUserById(userId);
  if (!account?.user) return json({ ignored: 'account deleted', type: event.type });

  const source = event.store === 'PLAY_STORE' ? 'play_store' : 'app_store';
  const { data: plan } = await db.from('plans').select('id').eq('slug', 'member-monthly').single();
  if (!plan) return json({ error: 'membership plan missing' }, 500);

  const end = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
  let status: string;
  let cancelAtPeriodEnd = false;
  switch (event.type) {
    case 'INITIAL_PURCHASE': case 'RENEWAL': case 'UNCANCELLATION': case 'PRODUCT_CHANGE':
      status = 'active';
      break;
    // Auto-renew turned off: the member keeps what they paid for until the period ends (a refund ends it at once,
    // and RevenueCat then sends an expiration time that has already passed).
    case 'CANCELLATION':
      status = end && end > new Date() ? 'active' : 'cancelled';
      cancelAtPeriodEnd = status === 'active';
      break;
    case 'EXPIRATION':
      status = 'expired';
      break;
    case 'BILLING_ISSUE':
      status = 'past_due';
      break;
    default:
      return json({ ignored: event.type });
  }

  const row = {
    user_id: userId, plan_id: plan.id, source, status, cancel_at_period_end: cancelAtPeriodEnd,
    external_id: event.original_transaction_id ?? event.id,
    current_period_end: end ? end.toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await db.from('subscriptions').select('id').eq('user_id', userId).eq('source', source).maybeSingle();
  const { error } = existing
    ? await db.from('subscriptions').update(row).eq('id', existing.id)
    : await db.from('subscriptions').insert(row);
  if (error) return json({ error: error.message }, 500);
  // App-store sales are invoiced by Apple/Google as the seller of record to the customer; record revenue in accounts from their reports.
  return json({ ok: true });
});
