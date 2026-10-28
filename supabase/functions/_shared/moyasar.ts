// Moyasar REST API (https://docs.moyasar.com). Amounts are in the smallest currency unit.
import { env } from './util.ts';

const BASE = 'https://api.moyasar.com/v1';

function headers() {
  return {
    Authorization: 'Basic ' + btoa(env('MOYASAR_SECRET_KEY') + ':'),
    'Content-Type': 'application/json',
  };
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, { ...init, headers: { ...headers(), ...(init.headers ?? {}) } });
  const body = await res.json();
  if (!res.ok) throw new Error(`Moyasar ${res.status}: ${JSON.stringify(body)}`);
  return body as T;
}

export type MoyasarInvoice = { id: string; url: string; status: string; amount: number; currency: string };
export type MoyasarPayment = {
  id: string; status: string; amount: number; currency: string; invoice_id?: string | null;
  metadata?: Record<string, string> | null; source?: { type: string; token?: string | null };
};

/** Hosted payment page: works the same on the website and inside the apps. */
export function createInvoice(p: { amount: number; currency: string; description: string; successUrl: string; backUrl: string; metadata: Record<string, string> }) {
  return call<MoyasarInvoice>('/invoices', {
    method: 'POST',
    body: JSON.stringify({
      amount: p.amount,
      currency: p.currency,
      description: p.description,
      success_url: p.successUrl,
      back_url: p.backUrl,
      metadata: p.metadata,
    }),
  });
}

export function getPayment(id: string) {
  return call<MoyasarPayment>(`/payments/${id}`);
}

export function refundPayment(id: string, amount?: number) {
  return call<MoyasarPayment>(`/payments/${id}/refund`, { method: 'POST', body: JSON.stringify(amount ? { amount } : {}) });
}

/** Merchant-initiated charge on a saved card token (box clubs). Recurring must be enabled on the Moyasar account. */
export function chargeToken(p: { token: string; amount: number; currency: string; description: string; metadata: Record<string, string> }) {
  return call<MoyasarPayment>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: p.amount,
      currency: p.currency,
      description: p.description,
      source: { type: 'token', token: p.token },
      metadata: p.metadata,
    }),
  });
}
