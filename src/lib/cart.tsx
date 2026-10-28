import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { CartLine, Product } from './types';

type Cart = {
  lines: CartLine[];
  count: number;
  subtotalSar: number;
  add: (p: Product, qty?: number) => void;
  setQty: (productId: string, qty: number) => void;
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
    add: (p, qty = 1) =>
      setLines((prev) => {
        const found = prev.find((l) => l.productId === p.id);
        if (found) return prev.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + qty } : l));
        return [...prev, { productId: p.id, slug: p.slug, name_en: p.name_en, name_ar: p.name_ar, unitPriceSar: p.base_price_sar, quantity: qty, image: p.images[0] ?? null }];
      }),
    setQty: (productId, qty) =>
      setLines((prev) => (qty <= 0 ? prev.filter((l) => l.productId !== productId) : prev.map((l) => (l.productId === productId ? { ...l, quantity: qty } : l)))),
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
