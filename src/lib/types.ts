export type Lang = 'ar' | 'en';

export type Product = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  base_price_sar: number;
  stock: number;
  images: string[];
  restricted_countries: string[];
  is_featured: boolean;
  product_prices?: { currency: string; amount_minor: number }[];
  product_tags?: { tags: Tag }[];
  category_id?: string | null;
  sku?: string | null;
  seo_title_en?: string | null;
  seo_title_ar?: string | null;
  seo_description_en?: string | null;
  seo_description_ar?: string | null;
  updated_at?: string;
  categories?: Pick<Category, 'slug' | 'name_en' | 'name_ar'> | null;
};

export type Category = {
  id: string;
  slug: string;
  name_en: string;
  name_ar: string;
  sort: number;
  image: string | null;
  blurb_en: string | null;
  blurb_ar: string | null;
};

export type Tag = {
  id: string;
  kind: 'occasion' | 'recipient' | 'collection';
  slug: string;
  name_en: string;
  name_ar: string;
  icon: string | null;
};

export type CartLine = {
  productId: string;
  slug: string;
  name_en: string;
  name_ar: string;
  unitPriceSar: number; // halalas
  quantity: number;
  image?: string | null;
};

export type ShipTo = {
  kind: 'home' | 'hotel' | 'office';
  recipient_name: string;
  phone: string;
  country: string;
  city: string;
  line1: string;
  line2?: string;
  hotel_name?: string;
  check_in?: string;
  check_out?: string;
};

export type ShippingQuote = {
  zoneId: string;
  carrier: string;
  service: string;
  amountSar: number;
  daysMin: number;
  daysMax: number;
};

export type Plan = {
  id: string;
  slug: string;
  kind: 'membership' | 'box';
  name_en: string;
  name_ar: string;
  description_en: string | null;
  description_ar: string | null;
  price_sar: number;
  period: 'month' | 'year';
  store_product_id_ios: string | null;
  store_product_id_android: string | null;
};
