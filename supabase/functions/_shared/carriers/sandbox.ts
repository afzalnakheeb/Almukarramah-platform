// The sandbox provider: no real parcels and no network. Rates come from carrier_rate_cards, tracking numbers from the
// idempotency key (the same request always gives the same answer), the label is a real one-page PDF marked SAMPLE,
// and tracking moves on by the clock: collected 2 hours after the label, in transit after 6, out for delivery after
// 24 (or the next morning), delivered after 30. Webhooks are signed with HMAC-SHA256 like a real provider's.
import type { CarrierAdapter, LandedCostRequest, QuoteRequest, ShipmentRequest, TrackingEvent } from './types.ts';

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

async function sha256(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(body)));
}

/** Constant-time comparison of two hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** The customer's phone as the seller's copy of a label shows it: the courier needs it, the seller does not (review M3). */
export function maskPhone(phone: string | null | undefined): string {
  const d = String(phone ?? '').replace(/[^0-9+]/g, '');
  return d.length > 6 ? `${d.slice(0, 4)}*****${d.slice(-2)}` : '';
}

/** A minimal single-page PDF (A6 label) with plain ASCII text. */
export function labelPdf(lines: string[]): Uint8Array {
  const safe = (s: string) => s.replace(/[^\x20-\x7E]/g, '?').replace(/([\\()])/g, '\\$1').slice(0, 90);
  const body = ['BT', '/F1 9 Tf', '12 TL', '20 400 Td', ...lines.flatMap((l, i) => [i === 0 ? '/F1 13 Tf' : i === 1 ? '/F1 9 Tf' : '', `(${safe(l)}) Tj`, 'T*']).filter(Boolean), 'ET',
    '0.8 g', '20 40 257 40 re f', '0 g', 'BT /F1 18 Tf 60 54 Td (SAMPLE - NOT A REAL LABEL) Tj ET'].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 297 420] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${enc.encode(body).length} >>\nstream\n${body}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(enc.encode(out).length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = enc.encode(out).length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return enc.encode(out);
}

const STEPS: { status: TrackingEvent['status']; afterHours: number; en: string; ar: string; location: (from: string, to: string) => string }[] = [
  { status: 'picked_up', afterHours: 2, en: 'Collected from the seller', ar: 'استلمها المندوب من البائع', location: (f) => f },
  { status: 'in_transit', afterHours: 6, en: 'On the way', ar: 'في الطريق', location: (f) => `${f} hub` },
  { status: 'out_for_delivery', afterHours: 24, en: 'Out for delivery', ar: 'خرجت للتوصيل', location: (_f, t) => t },
  { status: 'delivered', afterHours: 30, en: 'Delivered', ar: 'تم التوصيل', location: (_f, t) => t },
];

export function sandboxAdapter(webhookSecret: string): CarrierAdapter {
  return {
    id: 'sandbox',
    async quote(req: QuoteRequest) {
      const rate = req.rate ?? { first_kg_sar: 2000, extra_kg_sar: 500 };
      const kg = Math.max(1, Math.ceil(req.parcel.weight_g / 1000));
      return { service_code: req.service_code, amount_minor: rate.first_kg_sar + (kg - 1) * rate.extra_kg_sar, currency: 'SAR' };
    },
    async createShipment(req: ShipmentRequest) {
      const h = await sha256(`sandbox:${req.idempotency_key}`);
      const tracking = `SBX${String(parseInt(h.slice(0, 12), 16) % 10_000_000_000).padStart(10, '0')}`;
      const pickup = req.pickup_window ?? null;
      const label = labelPdf([
        'AL MUKARRAMAH - SANDBOX', `Tracking ${tracking}   Ref ${req.reference}   ${req.service_code}`,
        `FROM ${req.from.name}, ${req.from.line1}, ${req.from.city} ${req.from.country}`, `     ${req.from.phone}`,
        `TO   ${req.to.name}, ${req.to.line1}${req.to.line2 ? `, ${req.to.line2}` : ''}`, `     ${req.to.city} ${req.to.postal_code ?? ''} ${req.to.country}   ${maskPhone(req.to.phone)}`,
        `${(req.parcel.weight_g / 1000).toFixed(2)} kg${req.parcel.dangerous_goods ? '   DANGEROUS GOODS (UN1266 LQ)' : ''}${req.ddp ? '   DDP' : ''}`,
        `Declared ${(req.declared_value_minor / 100).toFixed(2)} ${req.currency}`,
        ...req.customs.slice(0, 6).map((c) => `${c.quantity} x ${c.description} ${c.hs_code ?? ''} ${c.origin_country ?? ''}`),
      ]);
      return { provider_ref: `sbx_${h.slice(0, 16)}`, tracking_number: tracking, tracking_url: `https://almukarramah.com/track?number=${tracking}`, label: { bytes: label, mime: 'application/pdf' }, pickup };
    },
    async track(ref, now = new Date()) {
      const start = new Date(ref.created_at).getTime();
      const hours = (now.getTime() - start) / 3_600_000;
      return STEPS.filter((s) => hours >= s.afterHours).map((s) => ({
        id: `${ref.tracking_number}:${s.status}`, status: s.status, at: new Date(start + s.afterHours * 3_600_000).toISOString(), en: s.en, ar: s.ar,
        location: s.location('Origin', 'Destination'),
      }));
    },
    async cancel() {
      return { ok: true };
    },
    async landedCost(req: LandedCostRequest) {
      const lines = req.lines.map((l) => {
        const bp = req.duty_bp(l.hs_code);
        return { hs_code: l.hs_code, duty_bp: bp, duty_minor: Math.round((l.value_minor * bp) / 10000) };
      });
      return { duties_minor: lines.reduce((s, l) => s + l.duty_minor, 0), lines };
    },
    async verifyWebhook(headers: Headers, rawBody: string) {
      const sig = (headers.get('x-am-signature') ?? '').toLowerCase();
      if (!webhookSecret || !/^[0-9a-f]{64}$/.test(sig)) return false;
      return sameHex(sig, await hmacHex(webhookSecret, rawBody));
    },
    parseWebhook(rawBody: string) {
      const body = JSON.parse(rawBody) as { events?: { tracking_number: string; id: string; status: TrackingEvent['status']; at: string; en?: string; ar?: string; location?: string }[] };
      const by = new Map<string, TrackingEvent[]>();
      for (const e of body.events ?? []) {
        if (!e.tracking_number || !e.status || !e.at) continue;
        by.set(e.tracking_number, [...(by.get(e.tracking_number) ?? []), { id: e.id, status: e.status, at: e.at, en: e.en ?? e.status, ar: e.ar ?? e.status, location: e.location ?? null }]);
      }
      return [...by].map(([tracking_number, events]) => ({ tracking_number, events }));
    },
  };
}
