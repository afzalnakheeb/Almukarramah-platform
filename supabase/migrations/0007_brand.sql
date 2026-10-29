-- Product brand (e.g. Ahmed Al Maghribi for resold perfumes); empty means Al Mukarramah's own products.
alter table public.products add column if not exists brand text;
