import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { CartLine, LineCustom, Product } from './types';

/** One line per product and set of choices. */
export const lineKey = (productId: string, custom?: LineCustom) => (custom ? `${productId}|${JSON.stringify(custom)}` : productId);
const keyOf = (l: CartLine) => l.key ?? l.productId;

/** Price of one item including any tailoring add-ons (display only: the server recalculates every total). */
export function unitPriceWith(p: Product, custom?: LineCustom): number {
  let extra = 0;
  for (const o of p.tailoring?.options ?? []) {
    const pick = custom?.options?.[o.key];
    extra += o.choices.find((c) => c.id === pick)?.price_minor ?? 0;
  }
  return p.base_price_sar + extra;
}

type Cart = {
  lines: CartLine[];
  count: number;
  subtotalSar: number;
  add: (p: Product, qty?: number, custom?: LineCustom) => void;
  /** key: the line's key (the product id for plain products). */
  setQty: (key: string, qty: number) => void;
  clear: () => void;
  /** Printed on the gift card; prices never appear on what the recipient sees. */
  giftMessage: string;
  setGiftMessage: (m: string) => void;
};

const Ctx = createContext<Cart | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [giftMessage, setGiftMessage] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet(['cart', 'giftMessage'])
      .then(([c, g]) => {
        if (c[1]) setLines(JSON.parse(c[1]));
        if (g[1]) setGiftMessage(g[1]);
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (ready) AsyncStorage.multiSet([['cart', JSON.stringify(lines)], ['giftMessage', giftMessage]]).catch(() => undefined);
  }, [lines, giftMessage, ready]);

  const value = useMemo<Cart>(() => ({
    lines,
    count: lines.reduce((n, l) => n + l.quantity, 0),
    subtotalSar: lines.reduce((s, l) => s + l.unitPriceSar * l.quantity, 0),
    add: (p, qty = 1, custom) =>
      setLines((prev) => {
        const key = lineKey(p.id, custom);
        const found = prev.find((l) => keyOf(l) === key);
        if (found) return prev.map((l) => (keyOf(l) === key ? { ...l, quantity: l.quantity + qty } : l));
        const seller = p.sellers?.kind === 'marketplace' ? p.sellers.name_en : null;
        return [...prev, { key, productId: p.id, slug: p.slug, name_en: p.name_en, name_ar: p.name_ar, unitPriceSar: unitPriceWith(p, custom), quantity: qty, image: p.images[0] ?? null, custom, sellerName: seller }];
      }),
    setQty: (key, qty) =>
      setLines((prev) => (qty <= 0 ? prev.filter((l) => keyOf(l) !== key) : prev.map((l) => (keyOf(l) === key ? { ...l, quantity: qty } : l)))),
    clear: () => {
      setLines([]);
      setGiftMessage('');
    },
    giftMessage,
    setGiftMessage,
  }), [lines, giftMessage]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCart outside CartProvider');
  return v;
}
