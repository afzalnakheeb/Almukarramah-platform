// A mock carrier for the Edge Function tests ("mockcarrier"), registered with the carrier registry the functions use.
// It answers like a real provider (a label, a tracking number) or fails the way a real API does: a timeout or a 5xx.
import { registerAdapter } from '../../functions/_shared/carriers/index.ts';
import { labelPdf } from '../../functions/_shared/carriers/sandbox.ts';

export const mockCarrier = {
  next: [] as ('timeout' | '5xx')[],
  calls: [] as { op: string; key: string }[],
};

registerAdapter('mockcarrier', () => ({
  id: 'mockcarrier',
  async quote(req) {
    return { service_code: req.service_code, amount_minor: 2500, currency: 'SAR' };
  },
  async createShipment(req) {
    mockCarrier.calls.push({ op: 'create', key: req.idempotency_key });
    const fail = mockCarrier.next.shift();
    if (fail === 'timeout') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    if (fail === '5xx') throw new Error('mockcarrier 503: Service Unavailable');
    const n = `MCK${req.idempotency_key.replace(/[^0-9a-z]/gi, '').slice(-10).toUpperCase()}`;
    return { provider_ref: `mck_${n}`, tracking_number: n, tracking_url: `https://track.mock.test/${n}`, label: { bytes: labelPdf(['MOCK', n]), mime: 'application/pdf' as const }, pickup: req.pickup_window ?? null };
  },
  async track() {
    return [];
  },
  async cancel() {
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
