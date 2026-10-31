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
  listing_status?: 'draft' | 'check_pending' | 'pending_review' | 'approved' | 'rejected' | 'suspended';
  sellers?: SellerRef | null;
  // Modest fashion
  made_to_measure?: boolean;
  garment?: string | null;
  garment_style?: string | null;
  attributes?: Record<string, unknown>;
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
  handling_days: number;
  returns_en: string | null; returns_ar: string | null;
  kind: 'marketplace' | 'partner';
  status: 'pending' | 'info_requested' | 'approved' | 'rejected' | 'suspended';
  /** negotiated commission; null: the category's rate */
  commission_bps: number | null; review_note: string | null;
  /** a live shop's text changes, waiting for our team's approval (review H5); the public page shows the approved text */
  profile_pending?: Partial<Record<'name_en' | 'name_ar' | 'tagline_en' | 'tagline_ar' | 'about_en' | 'about_ar' | 'returns_en' | 'returns_ar' | 'website', string | null>> | null;
  profile_submitted_at?: string | null;
  created_at: string;
};

export type SizeChart = { unit: 'cm' | 'in'; columns: string[]; rows: Record<string, string | number>[] };

export type TailoringChoice = { id: string; label: Bi; image?: string | null; price_minor: number; season?: 'summer' | 'winter' | 'all' };
export type TailoringOption = { key: string; label: Bi; choices: TailoringChoice[] };
/** Made-to-measure seam (owned with the tailoring workstream): the regional style, the measurements this brand needs
 *  (centimetres), the design options with price adjustments (fabrics are the option "fabric", with a season). */
export type TailoringMeasurement = { key: string; label?: Bi; min_cm?: number; max_cm?: number; required?: boolean };
export type Tailoring = { production_days: number; options: TailoringOption[]; style?: string; measurements?: TailoringMeasurement[] };

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
  /** the option chosen (size, volume, colour) when the listing has options */
  variantId?: string | null;
  variantLabel?: { en: string; ar: string } | null;
};
/** One option of a listing as the shop shows it (price in halalas, VAT included; null: the product's price). */
export type ProductVariant = { id: string; label_en: string; label_ar: string; price_minor: number | null; stock: number; sort: number };

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
