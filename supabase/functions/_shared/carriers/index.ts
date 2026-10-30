// The provider behind each approved carrier service (carrier_providers.id). Only the sandbox works today; the real
// aggregators (OTO for Saudi Arabia and the UAE, Shiprocket for India, DHL Express for cross-border duties paid) are
// added here as adapters when their accounts exist, with their keys as Supabase secrets named in carrier_providers.
import { sandboxAdapter } from './sandbox.ts';
import { NotConnected, type CarrierAdapter } from './types.ts';

export type { CarrierAdapter } from './types.ts';
export { NotConnected } from './types.ts';

function notConnected(id: string): CarrierAdapter {
  const no = () => Promise.reject(new NotConnected(id));
  return { id, quote: no, createShipment: no, track: no, cancel: no, landedCost: no, verifyWebhook: () => Promise.resolve(false), parseWebhook: () => [] };
}

/** env: reads a secret (Deno.env.get in functions). The sandbox signs its webhooks with CRON_SECRET (no new secret). */
export function adapterFor(providerId: string, env: (name: string) => string | undefined): CarrierAdapter {
  if (providerId === 'sandbox') return sandboxAdapter(env('SANDBOX_WEBHOOK_SECRET') ?? env('CRON_SECRET') ?? '');
  return notConnected(providerId);
}
