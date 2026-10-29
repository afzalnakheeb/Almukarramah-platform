// Delivery options for the checkout: our own delivery zones for items we ship, plus each seller's delivery charge
// for items sellers and partners ship themselves.
import { priceCart, type CartItem } from '../_shared/cart.ts';
import { quotes } from '../_shared/shipping.ts';
import { admin, handle, json } from '../_shared/util.ts';

Deno.serve(handle(async (req) => {
  const { shipTo, items } = await req.json() as { shipTo: { country: string; city: string; kind: string }; items: CartItem[] };
  const db = admin();
  const cart = await priceCart(db, items, shipTo);
  const list = cart.needsZone ? await quotes(db, shipTo, cart.houseWeightG, cart.houseSpray) : [];
  // Tell the shopper why there is no delivery option (perfume sprays cannot fly by courier yet).
  return json({
    quotes: list,
    needsZone: cart.needsZone,
    sellerShipping: cart.sellerShipping.map((s) => ({ name: s.name, amountSar: s.amountSar, handlingDays: s.handlingDays })),
    reason: cart.needsZone && !list.length && cart.houseSpray ? 'perfume_spray' : null,
  });
}));
