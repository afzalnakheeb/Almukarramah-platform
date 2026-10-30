// Delivery options in the shape older versions of the apps expect (the website uses shipping-quote). Same rulebook.
import { deliveryQuote } from '../_shared/quote.ts';
import { admin, handle, json } from '../_shared/util.ts';

Deno.serve(handle(async (req) => {
  const { shipTo, items } = await req.json();
  const q = await deliveryQuote(admin(), items ?? [], shipTo);
  if (q.blocked.length) return json({ error: q.blocked.map((b) => b.en).join(' ') }, 409);
  return json({
    quotes: q.zones, needsZone: q.needsZone, reason: q.reason,
    sellerShipping: q.parcels.map((p) => ({ name: p.name.en, amountSar: p.amountSar, handlingDays: p.handlingDays })),
  });
}));
