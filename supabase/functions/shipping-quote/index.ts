// Delivery for the checkout, decided by the rulebook: which items can go to this address (and why not), each seller's
// parcel with the platform's delivery price and estimate (made-to-measure time included), duties paid at checkout,
// and the delivery zones for our own products. Amounts in halalas; the server recalculates everything at payment.
import { deliveryQuote } from '../_shared/quote.ts';
import { admin, handle, json } from '../_shared/util.ts';

Deno.serve(handle(async (req) => {
  const { shipTo, items } = await req.json();
  return json(await deliveryQuote(admin(), items ?? [], shipTo));
}));
