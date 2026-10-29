// Lets a signed-in customer cancel or resume their own website subscription (paid with a saved card).
// Cancelling stops future charges; membership or deliveries continue until the end of the paid period.
// App Store / Google Play subscriptions are managed in the store, as Apple and Google require.
import { admin, caller, handle, json } from '../_shared/util.ts';

Deno.serve(handle(async (req) => {
  const user = await caller(req);
  if (!user) return json({ error: 'Sign in first' }, 401);
  const { subscriptionId, action } = (await req.json()) as { subscriptionId: string; action: 'cancel' | 'resume' };
  if (!['cancel', 'resume'].includes(action)) return json({ error: 'Unknown action' }, 400);

  const db = admin();
  const { data: sub } = await db.from('subscriptions')
    .select('id, user_id, source, status, current_period_end').eq('id', subscriptionId).maybeSingle();
  if (!sub || sub.user_id !== user.id) return json({ error: 'Subscription not found' }, 404);
  if (sub.source !== 'moyasar') return json({ error: 'store_managed' }, 400);
  if (action === 'resume' && sub.status !== 'active') return json({ error: 'This subscription has ended. Please join again.' }, 400);

  const { data, error } = await db.from('subscriptions')
    .update({ cancel_at_period_end: action === 'cancel', updated_at: new Date().toISOString() })
    .eq('id', sub.id).select('id, status, cancel_at_period_end, current_period_end').single();
  if (error) throw error;
  return json({ subscription: data });
}));
