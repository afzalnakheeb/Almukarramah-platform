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
  brand?: string | null;
  ship_class?: 'standard' | 'perfume_spray' | 'perfume_oil';
  seo_title_en?: string | null;
  seo_title_ar?: string | null;
  seo_description_en?: string | null;
  seo_description_ar?: string | null;
  updated_at?: string;
  categories?: Pick<Category, 'slug' | 'name_en' | 'name_ar'> | null;
  // Marketplace
  seller_id?: string | null;
  listing_status?: 'draft' | 'pending_review' | 'approved' | 'rejected';
  sellers?: SellerRef | null;
  // Modest fashion
  made_to_measure?: boolean;
  garment?: 'thobe' | 'abaya' | 'other' | null;
  sizes?: string[] | null;
  size_chart?: SizeChart | null;
  tailoring?: Tailoring | null;
};

export type Bi = { en: string; ar: string };

/** Public view of a seller (marketplace sellers only; partners are never shown). */
export type SellerRef = { slug: string; name_en: string; name_ar: string | null; country: string; kind?: 'marketplace' | 'partner' };

export type Seller = SellerRef & {
  id: string;
  tagline_en: string | null; tagline_ar: string | null;
  about_en: string | null; about_ar: string | null;
  city: string | null; logo: string | null; banner: string | null; website: string | null;
  ships_to: string[]; handling_days: number;
  ship_home_minor: number; ship_intl_minor: number; ship_overrides: Record<string, number>; free_ship_over_minor: number | null;
  returns_en: string | null; returns_ar: string | null;
  kind: 'marketplace' | 'partner';
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  commission_bps: number; review_note: string | null;
  created_at: string;
};

export type SizeChart = { unit: 'cm' | 'in'; columns: string[]; rows: Record<string, string | number>[] };

export type TailoringChoice = { id: string; label: Bi; image?: string | null; price_minor: number };
export type TailoringOption = { key: string; label: Bi; choices: TailoringChoice[] };
export type Tailoring = { production_days: number; options: TailoringOption[] };

/** What the customer chose for one cart line (size, design options, measurements in cm). */
export type LineCustom = {
  size?: string;
  options?: Record<string, string>;
  measurements?: Record<string, number>;
  profileName?: string;
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
  department?: 'gifts' | 'fashion';
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
  /** Unique per product + choices, so two differently tailored thobes are two lines. */
  key?: string;
  custom?: LineCustom;
  sellerName?: string | null;
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
