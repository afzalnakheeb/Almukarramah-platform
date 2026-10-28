import { quotes } from '../_shared/shipping.ts';
import { admin, handle, json } from '../_shared/util.ts';

Deno.serve(handle(async (req) => {
  const { shipTo, items } = await req.json() as { shipTo: { country: string; city: string; kind: string }; items: { productId: string; quantity: number }[] };
  const db = admin();
  const { data: products } = await db.from('products').select('id, weight_g').in('id', items.map((i) => i.productId));
  const weight = items.reduce((g, i) => g + (products?.find((p) => p.id === i.productId)?.weight_g ?? 500) * i.quantity, 0);
  return json({ quotes: await quotes(db, shipTo, weight) });
}));
