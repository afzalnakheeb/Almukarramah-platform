// RevenueCat sends app-store subscription events here (membership bought inside the iPhone or Android app).
// In RevenueCat, set the webhook Authorization header to the REVENUECAT_WEBHOOK_AUTH secret, and use the
// Supabase user id as the app user id (the app does this in initPurchases).
import { admin, env, json } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== env('REVENUECAT_WEBHOOK_AUTH')) return json({ error: 'unauthorised' }, 401);
  const { event } = await req.json();
  const db = admin();
  const userId: string = event.app_user_id;
  const source = event.store === 'PLAY_STORE' ? 'play_store' : 'app_store';

  const { data: plan } = await db.from('plans').select('id').eq('slug', 'member-monthly').single();
  if (!plan) return json({ error: 'membership plan missing' }, 500);

  const status = ({
    INITIAL_PURCHASE: 'active', RENEWAL: 'active', UNCANCELLATION: 'active', PRODUCT_CHANGE: 'active',
    CANCELLATION: 'cancelled', EXPIRATION: 'expired', BILLING_ISSUE: 'past_due',
  } as Record<string, string>)[event.type];
  if (!status) return json({ ignored: event.type });

  const row = {
    user_id: userId, plan_id: plan.id, source, status, external_id: event.original_transaction_id ?? event.id,
    current_period_end: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await db.from('subscriptions').select('id').eq('user_id', userId).eq('source', source).maybeSingle();
  if (existing) await db.from('subscriptions').update(row).eq('id', existing.id);
  else await db.from('subscriptions').insert(row);
  // App-store sales are invoiced by Apple/Google as the seller of record to the customer; record revenue in accounts from their reports.
  return json({ ok: true });
});
