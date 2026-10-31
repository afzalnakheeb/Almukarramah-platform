// The provider behind each approved carrier service (carrier_providers.id). Only the sandbox works today; the real
// aggregators (OTO for Saudi Arabia and the UAE, Shiprocket for India, DHL Express for cross-border duties paid) are
// added here as adapters when their accounts exist (registerAdapter), with their keys as Supabase secrets named in
// carrier_providers. A provider must also be switched on (carrier_providers.active) to be used.
//
// The carrier contract (review R4-5): an adapter calls its API through carrierCall (http.ts), which tells a definite
// refusal from an unknown outcome; whatever createShipment throws reaches the functions as a CarrierError (unknown
// unless it is a refusal), and a second request with the same idempotency key must answer with the label already sold
// (tested for every adapter: carriers.test.ts and review4.test.ts).
import { sandboxAdapter } from './sandbox.ts';
import { asCarrierError, NotConnected, type CarrierAdapter } from './types.ts';

export type { CarrierAdapter } from './types.ts';
export { asCarrierError, CarrierError, definiteRefusal, NotConnected } from './types.ts';
export { carrierCall } from './http.ts';

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

/** The providers with an adapter (for the contract test). */
export function registeredProviders(): string[] {
  return [...registry.keys()];
}

/** An adapter whose label purchase only ever fails with a CarrierError. */
function guarded(a: CarrierAdapter): CarrierAdapter {
  return { ...a, createShipment: (req) => a.createShipment(req).catch((e) => { throw asCarrierError(e); }) };
}

function notConnected(id: string): CarrierAdapter {
  const no = () => Promise.reject(new NotConnected(id));
  return { id, quote: no, createShipment: no, track: no, cancel: no, landedCost: no, verifyWebhook: () => Promise.resolve(false), parseWebhook: () => [] };
}

/** env: reads a secret (Deno.env.get in functions). */
export function adapterFor(providerId: string, env: Env): CarrierAdapter {
  const make = registry.get(providerId);
  return guarded(make ? make(env) : notConnected(providerId));
}
