// What every carrier provider (an aggregator such as OTO or Shiprocket, a carrier such as DHL, or the sandbox) offers
// the platform. Functions only ever talk to this interface, so switching on a real provider is one new adapter.
export type Address = {
  name: string; phone: string; country: string; city: string; district?: string | null; line1: string; line2?: string | null;
  postal_code?: string | null; short_address?: string | null;
};
export type Parcel = { weight_g: number; length_mm?: number | null; width_mm?: number | null; height_mm?: number | null; dangerous_goods?: boolean };
export type CustomsLine = { description: string; quantity: number; value_minor: number; hs_code: string | null; origin_country: string | null };

export type QuoteRequest = { service_code: string; from: string; to: string; parcel: Parcel; rate?: { first_kg_sar: number; extra_kg_sar: number } | null };
export type QuoteResult = { service_code: string; amount_minor: number; currency: 'SAR'; days_min?: number; days_max?: number };

export type ShipmentRequest = {
  idempotency_key: string; reference: string; service_code: string; from: Address; to: Address; parcel: Parcel;
  ddp: boolean; declared_value_minor: number; currency: string; customs: CustomsLine[]; pickup_window?: { from: string; to: string } | null;
};
export type ShipmentResult = {
  provider_ref: string; tracking_number: string; tracking_url: string; label: { bytes: Uint8Array; mime: 'application/pdf' };
  pickup: { from: string; to: string } | null;
};

export type TrackingStatus = 'label_created' | 'pickup_scheduled' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'cancelled' | 'returned';
export type TrackingEvent = { id: string; status: TrackingStatus; at: string; en: string; ar: string; location?: string | null };

export type LandedCostRequest = { from: string; to: string; lines: CustomsLine[]; shipping_minor: number; duty_bp: (hs: string | null) => number };
export type LandedCostResult = { duties_minor: number; lines: { hs_code: string | null; duty_bp: number; duty_minor: number }[] };

export interface CarrierAdapter {
  readonly id: string;
  quote(req: QuoteRequest): Promise<QuoteResult>;
  createShipment(req: ShipmentRequest): Promise<ShipmentResult>;
  /** events so far for a shipment (the sandbox derives them from the time since the label was bought) */
  track(ref: { provider_ref: string; tracking_number: string; created_at: string }, now?: Date): Promise<TrackingEvent[]>;
  cancel(ref: { provider_ref: string; tracking_number: string }): Promise<{ ok: boolean; reason?: string }>;
  landedCost(req: LandedCostRequest): Promise<LandedCostResult>;
  /** checks a webhook's signature against the raw body; never trust an unsigned call */
  verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>;
  /** a webhook body as tracking events, keyed by tracking number */
  parseWebhook(rawBody: string): { tracking_number: string; events: TrackingEvent[] }[];
}

/**
 * A carrier's failure. definite: the carrier answered and refused (a 4xx: the address, the weight), so nothing was
 * bought; otherwise (a timeout, a dropped connection, a 5xx) the label may have been sold and the answer lost
 * (review R3-5). Adapters throw it for refusals; anything else thrown counts as unknown.
 */
export class CarrierError extends Error {
  readonly definite: boolean;
  readonly status: number | null;
  constructor(message: string, definite: boolean, status: number | null = null) {
    super(message);
    this.name = 'CarrierError';
    this.definite = definite;
    this.status = status;
  }
}
/** Whether a carrier failure is a definite refusal (nothing bought): only a CarrierError that says so, or NotConnected. */
export function definiteRefusal(e: unknown): boolean {
  return e instanceof NotConnected || (e instanceof CarrierError && e.definite);
}
/** Any failure as a CarrierError: unknown unless the adapter refused definitely (or the provider is not connected). */
export function asCarrierError(e: unknown): CarrierError {
  if (e instanceof CarrierError) return e;
  if (e instanceof NotConnected) return new CarrierError(e.message, true, null);
  return new CarrierError(e instanceof Error ? e.message : String(e), false, null);
}

export class NotConnected extends Error {
  constructor(provider: string) {
    super(`${provider} is not connected yet (see docs/marketplace/SWITCH-ON.md)`);
    this.name = 'NotConnected';
  }
}
