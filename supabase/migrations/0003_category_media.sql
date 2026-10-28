-- Category tiles on the homepage and shop show a photo and a short line.
alter table categories add column if not exists image text;
alter table categories add column if not exists blurb_en text;
alter table categories add column if not exists blurb_ar text;
alter table categories add column if not exists is_active boolean not null default true;
-- Supplier reference (the SKU used in the original photo library), kept for stock and re-ordering.
alter table products add column if not exists sku text;
create index if not exists products_category_idx on products (category_id) where is_active;
