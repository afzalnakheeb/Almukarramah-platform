// Moyasar REST API (https://docs.moyasar.com). Amounts are in the smallest currency unit.
//
// Every call has a time limit. A failure says whether Moyasar DEFINITELY did not do it (a 4xx rejection with Moyasar's
// JSON error: 400, 401, 403, 404, 422) or whether we cannot know (a timeout, a dropped connection, a 5xx or an HTML
// gateway page): money operations treat only the first as "failed" and reconcile the second by reading the payment
// back (review H2).
import { env } from './util.ts';

const BASE = 'https://api.moyasar.com/v1';

export class MoyasarError extends Error {
  readonly status: number | null;
  /** true: Moyasar answered and refused, so nothing happened; false: we do not know whether it happened */
  readonly definite: boolean;
  readonly body: unknown;
  constructor(message: string, status: number | null, definite: boolean, body: unknown = null) {
    super(message);
    this.name = 'MoyasarError';
    this.status = status;
    this.definite = definite;
    this.body = body;
  }
}

function headers() {
  return {
    Authorization: 'Basic ' + btoa(env('MOYASAR_SECRET_KEY') + ':'),
    'Content-Type': 'application/json',
  };
}

const DEFINITE = new Set([400, 401, 403, 404, 422]);

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const ms = Number(Deno.env.get('MOYASAR_TIMEOUT_MS') ?? '') || 20000;
  let res: Response;
  try {
    res = await fetch(BASE + path, { ...init, headers: { ...headers(), ...(init.headers ?? {}) }, signal: AbortSignal.timeout(ms) });
  } catch (e) {
    throw new MoyasarError(`Moyasar did not answer (${(e as Error).name === 'TimeoutError' ? 'timeout' : (e as Error).message})`, null, false);
  }
  const text = await res.text().catch(() => '');
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (res.ok && body && typeof body === 'object') return body as T;
  const json = body !== null && typeof body === 'object';
  throw new MoyasarError(`Moyasar ${res.status}: ${json ? JSON.stringify(body).slice(0, 500) : text.slice(0, 200)}`, res.status, !res.ok && json && DEFINITE.has(res.status), body);
}

export type MoyasarInvoice = { id: string; url: string; status: string; amount: number; currency: string };
export type MoyasarPayment = {
  id: string; status: string; amount: number; currency: string; refunded?: number; refunded_at?: string | null; invoice_id?: string | null;
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
  return call<MoyasarPayment>(`/payments/${encodeURIComponent(id)}`);
}

export function refundPayment(id: string, amount?: number) {
  return call<MoyasarPayment>(`/payments/${encodeURIComponent(id)}/refund`, { method: 'POST', body: JSON.stringify(amount ? { amount } : {}) });
}

/**
 * Merchant-initiated charge on a saved card token (box clubs). Recurring must be enabled on the Moyasar account.
 * givenId (a UUID) makes it idempotent: Moyasar uses it as the payment's id, and the same givenId again answers with
 * that payment instead of charging again (https://docs.moyasar.com/api/idempotency), so a lost answer is asked again.
 */
export function chargeToken(p: { token: string; amount: number; currency: string; description: string; metadata: Record<string, string>; givenId?: string }) {
  return call<MoyasarPayment>('/payments', {
    method: 'POST',
    body: JSON.stringify({
      ...(p.givenId ? { given_id: p.givenId } : {}),
      amount: p.amount,
      currency: p.currency,
      description: p.description,
      source: { type: 'token', token: p.token },
      metadata: p.metadata,
    }),
  });
}
