// The provider behind each approved carrier service (carrier_providers.id). Only the sandbox works today; the real
// aggregators (OTO for Saudi Arabia and the UAE, Shiprocket for India, DHL Express for cross-border duties paid) are
// added here as adapters when their accounts exist (registerAdapter), with their keys as Supabase secrets named in
// carrier_providers. A provider must also be switched on (carrier_providers.active) to be used.
import { sandboxAdapter } from './sandbox.ts';
import { NotConnected, type CarrierAdapter } from './types.ts';

export type { CarrierAdapter } from './types.ts';
export { CarrierError, definiteRefusal, NotConnected } from './types.ts';

type Env = (name: string) => string | undefined;
const registry = new Map<string, (env: Env) => CarrierAdapter>([
  // The sandbox signs its webhooks with its own secret, SANDBOX_WEBHOOK_SECRET: never the scheduler's secret, which
  // would let anyone holding it mark parcels delivered (review L9). Without it, its webhooks are refused.
  ['sandbox', (env) => sandboxAdapter(env('SANDBOX_WEBHOOK_SECRET') ?? '')],
]);

/** Adds a provider's adapter (a real aggregator when its account exists; the tests' mock carrier). */
export function registerAdapter(providerId: string, make: (env: Env) => CarrierAdapter) {
  registry.set(providerId, make);
}

function notConnected(id: string): CarrierAdapter {
  const no = () => Promise.reject(new NotConnected(id));
  return { id, quote: no, createShipment: no, track: no, cancel: no, landedCost: no, verifyWebhook: () => Promise.resolve(false), parseWebhook: () => [] };
}

/** env: reads a secret (Deno.env.get in functions). */
export function adapterFor(providerId: string, env: Env): CarrierAdapter {
  const make = registry.get(providerId);
  return make ? make(env) : notConnected(providerId);
}
