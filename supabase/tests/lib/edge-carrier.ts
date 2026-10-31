// A mock carrier for the Edge Function tests ("mockcarrier"), registered with the carrier registry the functions use.
// It answers like a real provider: a label and a tracking number, the same label again for the same key (a provider
// deduplicates by the key, so a key never buys two labels), or a failure the way a real API fails: a timeout before
// anything was bought, a timeout after the label was sold (the answer lost), a 5xx, or a definite refusal (a 4xx).
import { registerAdapter } from '../../functions/_shared/carriers/index.ts';
import { labelPdf } from '../../functions/_shared/carriers/sandbox.ts';

type Label = { provider_ref: string; tracking_number: string; tracking_url: string };
export const mockCarrier = {
  next: [] as ('timeout' | 'timeout_after' | '5xx' | 'refuse')[],
  calls: [] as { op: string; key: string }[],
  /** labels sold, by key */
  bought: new Map<string, Label>(),
  /** how long the carrier takes to answer (two people pressing at once overlap) */
  delayMs: 0,
};

registerAdapter('mockcarrier', () => ({
  id: 'mockcarrier',
  async quote(req) {
    return { service_code: req.service_code, amount_minor: 2500, currency: 'SAR' };
  },
  async createShipment(req) {
    mockCarrier.calls.push({ op: 'create', key: req.idempotency_key });
    if (mockCarrier.delayMs) await new Promise((r) => setTimeout(r, mockCarrier.delayMs));
    const fail = mockCarrier.next.shift();
    if (fail === 'timeout') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    if (fail === '5xx') throw new Error('mockcarrier 503: Service Unavailable');
    if (fail === 'refuse') throw Object.assign(new Error('mockcarrier 422: the address was refused'), { name: 'CarrierError', definite: true, status: 422 });
    let label = mockCarrier.bought.get(req.idempotency_key);
    if (!label) {
      const n = `MCK${req.idempotency_key.replace(/[^0-9a-z]/gi, '').slice(-10).toUpperCase()}`;
      label = { provider_ref: `mck_${n}`, tracking_number: n, tracking_url: `https://track.mock.test/${n}` };
      mockCarrier.bought.set(req.idempotency_key, label);
    }
    if (fail === 'timeout_after') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    return { ...label, label: { bytes: labelPdf(['MOCK', label.tracking_number]), mime: 'application/pdf' as const }, pickup: req.pickup_window ?? null };
  },
  async track() {
    return [];
  },
  async cancel(req) {
    mockCarrier.calls.push({ op: 'cancel', key: String(req.provider_ref) });
    return { ok: true };
  },
  async landedCost() {
    return { duties_minor: 0, lines: [] };
  },
  async verifyWebhook() {
    return false;
  },
  parseWebhook() {
    return [];
  },
}));
