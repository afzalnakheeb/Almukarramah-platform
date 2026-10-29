-- Alcohol-based perfume sprays are dangerous goods by air (UN1266, flammable liquid). They are offered only on
-- delivery zones whose carrier accepts them (Saudi road couriers today). Oil-based perfumes and bakhoor ship normally.
alter table public.products add column if not exists ship_class text not null default 'standard'
  check (ship_class in ('standard', 'perfume_spray', 'perfume_oil'));
alter table public.shipping_zones add column if not exists accepts_perfume_spray boolean not null default false;
update public.shipping_zones set accepts_perfume_spray = true where name in ('Madinah same day', 'Saudi Arabia');
