// The sandbox carrier: deterministic labels and tracking, a valid PDF, signed webhooks; real providers stay off.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { adapterFor } from '../functions/_shared/carriers/index.ts';
import { hmacHex, labelPdf } from '../functions/_shared/carriers/sandbox.ts';
import type { ShipmentRequest } from '../functions/_shared/carriers/types.ts';

// the sandbox's webhooks are signed with their own secret (never the scheduler's: review L9)
const env = (n: string) => (n === 'SANDBOX_WEBHOOK_SECRET' ? 'test-secret' : undefined);
const sbx = adapterFor('sandbox', env);
const req = (key: string): ShipmentRequest => ({
  idempotency_key: key, reference: 'AM-104950-1', service_code: 'sbx-sa-road', ddp: false, declared_value_minor: 50000, currency: 'SAR',
  from: { name: 'Oud House', phone: '+966500000001', country: 'SA', city: 'Madinah', line1: 'King Fahd Road 12' },
  to: { name: 'Maryam', phone: '+966500000009', country: 'SA', city: 'Riyadh', line1: 'Olaya 1' },
  parcel: { weight_g: 900, dangerous_goods: true }, customs: [{ description: 'Oud oil', quantity: 2, value_minor: 50000, hs_code: '330129', origin_country: 'SA' }],
});

describe('sandbox carrier', () => {
  test('the same request gives the same shipment; another gives another', async () => {
    const a = await sbx.createShipment(req('key-000001'));
    const b = await sbx.createShipment(req('key-000001'));
    const c = await sbx.createShipment(req('key-000002'));
    assert.equal(a.tracking_number, b.tracking_number);
    assert.notEqual(a.tracking_number, c.tracking_number);
    assert.match(a.tracking_number, /^SBX\d{10}$/);
    assert.match(a.tracking_url, /^https:\/\//);
  });

  test('the label is a valid one-page PDF marked as a sample', async () => {
    const { label } = await sbx.createShipment(req('key-000003'));
    const text = new TextDecoder().decode(label.bytes);
    assert.ok(text.startsWith('%PDF-1.4'));
    assert.ok(text.trimEnd().endsWith('%%EOF'));
    assert.match(text, /SAMPLE - NOT A REAL LABEL/);
    assert.match(text, /DANGEROUS GOODS/);
    const xref = Number(/startxref\n(\d+)/.exec(text)![1]);
    assert.equal(text.slice(xref, xref + 4), 'xref', 'the cross-reference offset is exact');
    const pdf = new TextDecoder().decode(labelPdf(['Arabic is replaced: مرحبا', '(brackets) \\ escaped']));
    assert.match(pdf, /\(Arabic is replaced: \?+\) Tj/);
    assert.match(pdf, /\\\(brackets\\\) \\\\ escaped/);
  });

  test('tracking moves on by the clock and never invents the future', async () => {
    const created = '2026-11-01T08:00:00Z';
    const at = (h: number) => new Date(Date.parse(created) + h * 3_600_000);
    const track = async (h: number) => (await sbx.track({ provider_ref: 'x', tracking_number: 'SBX1', created_at: created }, at(h))).map((e) => e.status);
    assert.deepEqual(await track(1), []);
    assert.deepEqual(await track(7), ['picked_up', 'in_transit']);
    assert.deepEqual(await track(31), ['picked_up', 'in_transit', 'out_for_delivery', 'delivered']);
  });

  test('webhooks must carry a valid signature', async () => {
    const body = JSON.stringify({ events: [{ tracking_number: 'SBX1', id: 'e1', status: 'delivered', at: '2026-11-02T10:00:00Z' }] });
    const good = new Headers({ 'x-am-signature': await hmacHex('test-secret', body) });
    assert.equal(await sbx.verifyWebhook(good, body), true);
    assert.equal(await sbx.verifyWebhook(good, body.replace('delivered', 'returned')), false, 'a changed body');
    assert.equal(await sbx.verifyWebhook(new Headers(), body), false, 'unsigned');
    assert.equal(await adapterFor('sandbox', () => undefined).verifyWebhook(good, body), false, 'no secret configured: refuse');
    assert.deepEqual(sbx.parseWebhook(body), [{ tracking_number: 'SBX1', events: [{ id: 'e1', status: 'delivered', at: '2026-11-02T10:00:00Z', en: 'delivered', ar: 'delivered', location: null }] }]);
  });

  test('quotes from the rate card, duties from the rate function; real providers are not connected', async () => {
    assert.deepEqual(await sbx.quote({ service_code: 's', from: 'SA', to: 'SA', parcel: { weight_g: 2100 }, rate: { first_kg_sar: 1800, extra_kg_sar: 300 } }),
      { service_code: 's', amount_minor: 2400, currency: 'SAR' });
    const lc = await sbx.landedCost({ from: 'SA', to: 'GB', shipping_minor: 0, duty_bp: (hs) => (hs?.startsWith('33') ? 650 : 0),
      lines: [{ description: 'Oud', quantity: 1, value_minor: 10000, hs_code: '330129', origin_country: 'SA' }] });
    assert.equal(lc.duties_minor, 650);
    await assert.rejects(adapterFor('oto', env).createShipment(req('k')), /not connected/);
  });
});
