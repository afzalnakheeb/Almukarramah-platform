// Shares the signed-in seller's account with every seller dashboard screen.
import React, { createContext, useContext } from 'react';
import type { MySeller } from './seller';

type Ctx = { me: MySeller; reload: () => Promise<void> };
const SellerCtx = createContext<Ctx | null>(null);

export function SellerProvider({ value, children }: { value: Ctx; children: React.ReactNode }) {
  return <SellerCtx.Provider value={value}>{children}</SellerCtx.Provider>;
}

export function useSeller(): Ctx {
  const v = useContext(SellerCtx);
  if (!v) throw new Error('useSeller outside the seller dashboard');
  return v;
}

export const STATUS_TONE = { pending: 'info', info_requested: 'warn', approved: 'ok', rejected: 'err', suspended: 'err' } as const;
export const LISTING_TONE = { draft: 'mute', check_pending: 'info', pending_review: 'info', approved: 'ok', rejected: 'err', suspended: 'err' } as const;
