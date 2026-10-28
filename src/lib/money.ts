import type { Product } from './types';

export const CURRENCIES = ['SAR', 'AED', 'GBP', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];

// Sample rates, overwritten from the fx_rates table at start-up.
let fx: Record<string, number> = { SAR: 1, AED: 0.979, GBP: 0.21, USD: 0.2667, EUR: 0.245 };
export function setRates(rates: Record<string, number>) {
  fx = { ...fx, ...rates };
}

/** Price of a product in the shopper's currency, in minor units. Fixed prices win over conversion. */
export function priceIn(product: Pick<Product, 'base_price_sar' | 'product_prices'>, currency: string): number {
  const fixed = product.product_prices?.find((p) => p.currency === currency);
  if (fixed) return fixed.amount_minor;
  return convertFromSar(product.base_price_sar, currency);
}

export function convertFromSar(halalas: number, currency: string): number {
  const rate = fx[currency] ?? 1;
  return Math.round(halalas * rate);
}

export function formatMoney(minor: number, currency: string, lang: 'ar' | 'en' = 'en'): string {
  const locale = lang === 'ar' ? 'ar-SA' : 'en-GB';
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(minor / 100);
}

/** VAT included in a VAT-inclusive amount (15% in Saudi Arabia). */
export function vatIncluded(totalInclMinor: number, rateBp = 1500): number {
  return Math.round((totalInclMinor * rateBp) / (10000 + rateBp));
}
