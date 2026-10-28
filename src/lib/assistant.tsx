// The shop-wide assistant: one conversation that follows the shopper from page to page.
// It knows which page is open (product, bag, checkout…), and its suggestions are applied only when the shopper taps them.
import { useFocusEffect, useGlobalSearchParams, usePathname } from 'expo-router';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useCart } from '@/lib/cart';
import { useI18n } from '@/lib/i18n';
import { usePrefs } from '@/lib/prefs';
import { callFunction } from '@/lib/supabase';
import type { ShipTo } from '@/lib/types';

export type AssistantProduct = { slug: string; name: string; price_sar: number; image: string | null };
export type CheckoutFields = Partial<Pick<ShipTo, 'kind' | 'recipient_name' | 'phone' | 'hotel_name' | 'check_in' | 'check_out' | 'city' | 'country' | 'line1'>>;
export type AssistantAction =
  | { type: 'gift_message'; text: string }
  | { type: 'fill_checkout'; fields: CheckoutFields }
  | { type: 'open'; path: string };
export type Turn = { role: 'user' | 'assistant'; content: string; products?: AssistantProduct[]; action?: AssistantAction | null; applied?: boolean };
export type PageKind = 'home' | 'shop' | 'collection' | 'product' | 'cart' | 'checkout' | 'account' | 'membership' | 'trail' | 'other';

type Reply = { reply: string; products: AssistantProduct[]; action: AssistantAction | null; limited?: boolean };

type Ctx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  turns: Turn[];
  busy: boolean;
  error: string | null;
  page: { kind: PageKind; productSlug?: string; collection?: string; query?: string };
  send: (text: string) => Promise<void>;
  apply: (index: number) => boolean;
  reset: () => void;
  canFill: boolean;
  setFillHandler: (fn: ((f: CheckoutFields) => void) | null) => void;
};

const AssistantContext = createContext<Ctx | null>(null);

export function pageFromPath(path: string): Ctx['page'] {
  const seg = path.split('?')[0].split('/').filter(Boolean);
  if (seg.length === 0) return { kind: 'home' };
  switch (seg[0]) {
    case 'shop': return { kind: 'shop' };
    case 'collections': return { kind: 'collection', collection: seg[1] };
    case 'product': return { kind: 'product', productSlug: seg[1] };
    case 'cart': return { kind: 'cart' };
    case 'checkout': return { kind: 'checkout' };
    case 'account': return { kind: 'account' };
    case 'membership': return { kind: 'membership' };
    case 'trail': return { kind: 'trail' };
    default: return { kind: 'other' };
  }
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const { lang, t } = useI18n();
  const { lines, giftMessage, setGiftMessage } = useCart();
  const { destination } = usePrefs();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ q?: string }>();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fill = useRef<((f: CheckoutFields) => void) | null>(null);
  const [canFill, setCanFill] = useState(false);

  const page = useMemo(() => ({ ...pageFromPath(pathname), query: typeof params.q === 'string' ? params.q : undefined }), [pathname, params.q]);

  const send = useCallback(async (text: string) => {
    const content = text.trim().slice(0, 1200);
    if (!content || busy) return;
    const next: Turn[] = [...turns, { role: 'user', content }];
    setTurns(next);
    setBusy(true);
    setError(null);
    try {
      const res = await callFunction<Reply>('concierge', {
        lang,
        messages: next.map((m) => ({ role: m.role, content: m.content })),
        task: page.kind === 'cart' ? 'gift_message' : page.kind === 'checkout' ? 'checkout_fill' : 'chat',
        page: { ...page, path: pathname },
        cart: lines.map((l) => ({ slug: l.slug, quantity: l.quantity })),
        destination,
        giftMessage,
      });
      setTurns([...next, { role: 'assistant', content: res.reply, products: res.products ?? [], action: res.action ?? null }]);
    } catch {
      setError(t('conciergeError'));
      setTurns(turns); // let the shopper try the same message again
    } finally {
      setBusy(false);
    }
  }, [busy, turns, lang, page, pathname, lines, destination, giftMessage, t]);

  /** Applies a suggestion the shopper tapped. Returns false when it cannot be applied on this page. */
  const apply = useCallback((index: number) => {
    const turn = turns[index];
    const a = turn?.action;
    if (!a) return false;
    if (a.type === 'gift_message') setGiftMessage(a.text.slice(0, 200));
    else if (a.type === 'fill_checkout') {
      if (!fill.current) return false;
      fill.current(a.fields);
    } else return false;
    setTurns((ts) => ts.map((x, i) => (i === index ? { ...x, applied: true } : x)));
    return true;
  }, [turns, setGiftMessage]);

  const setFillHandler = useCallback((fn: ((f: CheckoutFields) => void) | null) => {
    fill.current = fn;
    setCanFill(!!fn);
  }, []);

  const value: Ctx = {
    open, setOpen, turns, busy, error, page, send, apply, canFill, setFillHandler,
    reset: () => { setTurns([]); setError(null); },
  };
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const c = useContext(AssistantContext);
  if (!c) throw new Error('useAssistant outside AssistantProvider');
  return c;
}

/** Checkout calls this so the assistant can fill in the delivery form while the page is on screen. */
export function useAssistantFill(handler: (f: CheckoutFields) => void) {
  const { setFillHandler } = useAssistant();
  const ref = useRef(handler);
  ref.current = handler;
  useFocusEffect(
    useCallback(() => {
      setFillHandler((f) => ref.current(f));
      return () => setFillHandler(null);
    }, [setFillHandler]),
  );
}
