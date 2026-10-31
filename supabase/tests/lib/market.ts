// Shared set-up for the marketplace tests that need orders: two approved sellers with a product each (seller A's oud
// has a 12 ml option), one of our own products, and orders written the way create-payment writes them.
import { type Db, ids, seedPeople, seedSellers, user } from './db.ts';

export type Shop = { A: string; B: string; oud: string; variant: string; thobe: string; dates: string; cat: (slug: string) => string };

/** People, two approved sellers and their products (both live). The marketplace is open unless said otherwise. */
export function seedShop(db: Db, opts: { open?: boolean } = {}): Shop {
  seedPeople(db);
  setMarketOpen(db, true);   // to apply and list (a database made with asShipped starts closed)
  const { A, B } = seedSellers(db);
  const cat = (slug: string) => db.val<string>(`select id from categories where slug = '${slug}'`);
  db.exec(`insert into seller_categories (seller_id, category_id, status) values ('${B}', '${cat('thobes')}', 'approved')`, 'service');
  const oud = db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id) values ('royal-oud', 'Royal oud', 'دهن عود ملكي', 25000, '${A}', '${cat('oud-oils')}') returning id`, user('sellerA'));
  const variant = db.val<string>(`insert into product_variants (product_id, label_en, label_ar, stock) values ('${oud}', '12 ml', '١٢ مل', 10) returning id`, user('sellerA'));
  const thobe = db.val<string>(`insert into products (slug, name_en, name_ar, base_price_sar, seller_id, category_id, made_to_measure, stock) values ('thobe', 'Thobe', 'ثوب', 50000, '${B}', '${cat('thobes')}', true, 0) returning id`, user('sellerB'));
  db.exec(`update products set listing_status = 'approved', is_active = true where id in ('${oud}', '${thobe}')`, 'service');
  const dates = db.val<string>(`select id from products where slug = 'ajwa-dates-1kg'`);
  db.exec(`update profiles set full_name = 'Maryam Al Harbi', language = 'en' where id = '${ids.customer}';
    update seller_private set iban = 'SA0380000000608010167519' where seller_id = '${A}'`, 'service');
  // the sandbox courier is off on a fresh database (it would mark real parcels delivered); the tests use it
  db.exec(`update carrier_providers set active = true where id = 'sandbox'`);
  if (opts.open === false) setMarketOpen(db, false);
  return { A, B, oud, variant, thobe, dates, cat };
}

/** The database switch (off by default); a no-op on a schema that does not have it yet. */
export function setMarketOpen(db: Db, open: boolean) {
  db.exec(`do $$ begin
    if exists (select 1 from information_schema.columns where table_name = 'mp_settings' and column_name = 'marketplace_open') then
      execute 'update mp_settings set marketplace_open = ${open}, sellers_open = ${open} where id = 1';
    end if; end $$;`);
}

export type Order = { o: string; number: number; a: string; b: string; h: string; items: { a: string; b: string; h: string }; total: number; paymentRef: string };

/**
 * An unpaid order as create-payment writes it: seller A's parcel (2 × oud 12 ml), seller B's (a made-to-measure thobe)
 * and ours (Ajwa dates), each with 30 SAR delivery; 1,150 SAR in all, VAT included. Parcels we invoice (platform).
 */
export function unpaidOrder(db: Db, s: Shop, customer: string | null = ids.customer, f: { currency?: string; fx?: number } = {}): Order {
  const currency = f.currency ?? 'SAR';
  const fx = f.fx ?? 1;
  const conv = (sar: number) => Math.round(sar * fx);
  const paymentRef = `inv_${Math.random().toString(36).slice(2, 12)}`;
  const total = conv(25000) * 2 + conv(50000) + conv(6000) + conv(3000) * 3;
  const row = db.one<{ id: string; number: number }>(`insert into orders (user_id, email, currency, subtotal_minor, shipping_minor, total_minor, vat_minor, ship_to, idempotency_key, fx_per_sar, payment_ref, gift_message)
    values (${customer ? `'${customer}'` : 'null'}, 'buyer@test.local', '${currency}', ${total - conv(3000) * 3}, ${conv(3000) * 3}, ${total}, ${Math.round(total * 15 / 115)},
            '{"kind": "home", "recipient_name": "Maryam Al Harbi", "phone": "+966500000009", "country": "SA", "city": "Riyadh", "line1": "Olaya 1"}',
            'idem-' || substr(md5(random()::text), 1, 12), ${fx}, '${paymentRef}', 'Happy Eid! Call me on 0501234567') returning id, number`, 'service');
  const o = row.id;
  const sub = (seq: number, seller: string | null, kind: string, items: number, commission: number) => db.val<string>(`insert into sub_orders (order_id, seq, seller_id, kind, currency, items_minor,
      shipping_minor, invoicer, vat_mode, duties_mode, from_country, to_country, handling_days, production_days, days_min, days_max, commission_minor, service_id)
    values ('${o}', ${seq}, ${seller ? `'${seller}'` : 'null'}, '${kind}', '${currency}', ${items}, ${conv(3000)}, 'platform', 'origin', 'none', 'SA', 'SA', 2, 0, 3, 5, ${commission},
            ${seller ? `(select id from carrier_services where provider_id = 'sandbox' order by sort limit 1)` : 'null'}) returning id`, 'service');
  const a = sub(1, s.A, 'marketplace', conv(50000), conv(12500));
  const b = sub(2, s.B, 'marketplace', conv(50000), conv(12500));
  const h = sub(3, null, 'house', conv(6000), 0);
  const line = (sb: string, product: string, v: string | null, name: string, unit: number, q: number, seller: string | null, comm: number | null, policy: string, window: number) =>
    db.val<string>(`insert into order_items (order_id, sub_order_id, product_id, variant_id, variant_label, name_en, name_ar, unit_price_minor, quantity, line_total_minor,
        seller_id, commission_bps, commission_minor, return_policy, return_window_days, vat_rate_bp, vat_minor, custom)
      values ('${o}', '${sb}', '${product}', ${v ? `'${v}'` : 'null'}, ${v ? `'12 ml / ١٢ مل'` : 'null'}, '${name}', '${name} ar', ${unit}, ${q}, ${unit * q},
              ${seller ? `'${seller}'` : 'null'}, ${comm === null ? 'null' : 2500}, ${comm === null ? 'null' : comm}, '${policy}', ${window}, 1500, ${Math.round(unit * q * 15 / 115)},
              ${policy === 'faulty_only' && seller ? `'{"measurements": {"chest": 104}}'` : 'null'}) returning id`, 'service');
  const items = {
    a: line(a, s.oud, s.variant, 'Royal oud', conv(25000), 2, s.A, conv(12500), 'unopened_only', 7),
    b: line(b, s.thobe, null, 'Thobe', conv(50000), 1, s.B, conv(12500), 'faulty_only', 14),
    h: line(h, s.dates, null, 'Ajwa dates', conv(6000), 1, null, null, 'standard', 14),
  };
  return { o, number: Number(row.number), a, b, h, items, total, paymentRef };
}
