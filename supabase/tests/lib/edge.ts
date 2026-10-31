// Runs our Supabase Edge Functions (Deno code) under Node for the tests, against the local test database:
// * supabase-js is the local stand-in (fake-supabase.ts), so every database call runs as SQL with the right role;
// * Deno.serve and Deno.env are shimmed: importing a function captures its request handler;
// * fetch is replaced: Moyasar is a programmable mock (payments, refunds, timeouts, 5xx, HTML pages, rejections) and
//   any other host is refused, so nothing leaves the machine;
// * carriers: the mock adapter here is registered with the carrier registry (and can time out or fail).
import { register } from 'node:module';
import { fake, tokenFor } from './fake-supabase.ts';

register('./esm-hooks.mjs', import.meta.url);

export { fake, tokenFor };

export const env: Record<string, string> = {
  SUPABASE_URL: 'https://project.supabase.test',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SUPABASE_ANON_KEY: 'anon-key',
  MOYASAR_SECRET_KEY: 'sk_test_harness',
  MOYASAR_WEBHOOK_SECRET: 'whsec_harness',
  CRON_SECRET: 'cron-secret-harness',
  SANDBOX_WEBHOOK_SECRET: 'sandbox-secret-harness',
  PUBLIC_SITE_URL: 'https://shop.test',
  MOYASAR_TIMEOUT_MS: '2000',
  // finish-pending normally leaves anything younger than two minutes to the function still handling it; the tests
  // run it straight away
  FINISH_PENDING_MIN_AGE_SECONDS: '0',
  REFUND_RECONCILE_GRACE_MINUTES: '15',
};
fake.env = (k) => env[k];

type Handler = (req: Request) => Promise<Response> | Response;
let capture: ((h: Handler) => void) | null = null;
(globalThis as Record<string, unknown>).Deno = {
  env: { get: (k: string) => env[k], toObject: () => ({ ...env }) },
  serve: (a: unknown, b?: unknown) => {
    const h = (typeof a === 'function' ? a : b) as Handler;
    if (!capture) throw new Error('Deno.serve called outside the test harness');
    capture(h);
    return { finished: Promise.resolve(), shutdown: () => Promise.resolve() };
  },
};

// ---------------------------------------------------------------- Moyasar (mock)
export type MoyasarPayment = {
  id: string; status: string; amount: number; currency: string; refunded: number; refunded_at: string | null;
  invoice_id: string | null; metadata: Record<string, string>; source: { type: string; token?: string | null };
};
/** What the next call of a kind does: answer normally, or fail in one of the ways a real network fails. */
export type Behaviour =
  | 'ok'
  | 'timeout'          // no answer; nothing happened at Moyasar
  | 'timeout_after'    // Moyasar did it, but the answer never came back
  | '5xx'              // a gateway error page (HTML); nothing happened
  | '5xx_after'        // a gateway error page after Moyasar did it
  | 'network'          // the connection failed
  | { status: number; json: unknown };   // a definite answer, such as a 400 rejection
export const moyasar = {
  payments: new Map<string, MoyasarPayment>(),
  /** the next new charge is declined by the bank (Moyasar answers 201 with status "failed") */
  declineNext: false,
  /** how many cards were really charged (a repeated given_id is not a new charge) */
  charges: 0,
  next: [] as { op: 'refund' | 'get' | 'invoice' | 'charge'; do: Behaviour }[],
  calls: [] as { op: string; path: string; body: unknown }[],
  /** a paid payment for an order, as Moyasar would hold it after the hosted page */
  pay(p: { orderId: string; amount: number; currency?: string; invoiceId?: string | null; token?: string | null }): MoyasarPayment {
    const id = `pay_${Math.random().toString(36).slice(2, 12)}`;
    const pay: MoyasarPayment = {
      id, status: 'paid', amount: p.amount, currency: p.currency ?? 'SAR', refunded: 0, refunded_at: null, invoice_id: p.invoiceId ?? null,
      metadata: { order_id: p.orderId }, source: { type: 'creditcard', token: p.token ?? null },
    };
    this.payments.set(id, pay);
    return pay;
  },
  reset() {
    this.next = [];
    this.calls = [];
    this.declineNext = false;
  },
};

const timeoutError = () => new DOMException('The operation was aborted due to timeout', 'TimeoutError');
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function moyasarFetch(url: URL, init: RequestInit | undefined): Promise<Response> {
  const path = url.pathname.replace(/^\/v1/, '');
  const body = init?.body ? JSON.parse(String(init.body)) : null;
  const auth = new Headers(init?.headers).get('authorization') ?? '';
  if (auth !== `Basic ${btoa(`${env.MOYASAR_SECRET_KEY}:`)}`) return json(401, { type: 'authentication_error', message: 'Invalid authorization credentials', errors: {} });
  const refundM = /^\/payments\/([^/]+)\/refund$/.exec(path);
  const getM = /^\/payments\/([^/]+)$/.exec(path);
  const op = refundM ? 'refund' : getM && (init?.method ?? 'GET') === 'GET' ? 'get' : path === '/invoices' ? 'invoice' : path === '/payments' ? 'charge' : 'other';
  moyasar.calls.push({ op, path, body });
  const i = moyasar.next.findIndex((x) => x.op === op);
  const behaviour: Behaviour = i >= 0 ? moyasar.next.splice(i, 1)[0].do : 'ok';
  if (typeof behaviour === 'object') return json(behaviour.status, behaviour.json);
  if (behaviour === 'timeout') throw timeoutError();
  if (behaviour === 'network') throw new TypeError('fetch failed: connection reset');
  if (behaviour === '5xx') return new Response('<html><body>502 Bad Gateway</body></html>', { status: 502, headers: { 'content-type': 'text/html' } });

  let answer: Response;
  if (refundM) {
    const pay = moyasar.payments.get(refundM[1]);
    if (!pay) return json(404, { type: 'record_not_found', message: 'Object not found', errors: {} });
    const amount = Number(body?.amount ?? pay.amount - pay.refunded);
    if (!(amount > 0) || pay.refunded + amount > pay.amount) {
      return json(400, { type: 'invalid_request_error', message: 'Amount must be less than or equal to the remaining amount', errors: { amount: ['is invalid'] } });
    }
    pay.refunded += amount;
    pay.refunded_at = new Date().toISOString();
    if (pay.refunded === pay.amount) pay.status = 'refunded';
    answer = json(200, pay);
  } else if (getM) {
    const pay = moyasar.payments.get(getM[1]);
    answer = pay ? json(200, pay) : json(404, { type: 'record_not_found', message: 'Object not found', errors: {} });
  } else if (op === 'invoice') {
    const id = `inv_${Math.random().toString(36).slice(2, 12)}`;
    answer = json(200, { id, url: `https://checkout.moyasar.test/invoices/${id}`, status: 'initiated', amount: body?.amount, currency: body?.currency });
  } else if (op === 'charge') {
    // a charge on a saved card. given_id makes it idempotent, as Moyasar does: the payment's id is the given_id, and
    // the same given_id again answers with the same payment instead of charging again
    const id = String(body?.given_id ?? `pay_${Math.random().toString(36).slice(2, 12)}`);
    let pay = moyasar.payments.get(id);
    if (!pay) {
      const declined = moyasar.declineNext;
      moyasar.declineNext = false;
      pay = { id, status: declined ? 'failed' : 'paid', amount: Number(body?.amount), currency: String(body?.currency ?? 'SAR'), refunded: 0, refunded_at: null, invoice_id: null,
              metadata: (body?.metadata ?? {}) as Record<string, string>, source: { type: 'token', token: body?.source?.token ?? null } };
      moyasar.payments.set(id, pay);
      moyasar.charges++;
    }
    answer = json(201, pay);
  } else {
    answer = json(404, { type: 'record_not_found', message: 'Not mocked', errors: {} });
  }
  if (behaviour === 'timeout_after') throw timeoutError();
  if (behaviour === '5xx_after') return new Response('<html><body>504 Gateway Timeout</body></html>', { status: 504, headers: { 'content-type': 'text/html' } });
  return answer;
}

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
  if (url.origin === 'https://api.moyasar.com') return moyasarFetch(url, init);
  throw new Error(`network access in a test: ${url.href}`);
}) as typeof fetch;

// ---------------------------------------------------------------- running a function
const handlers = new Map<string, Promise<Handler>>();

/** The request handler of supabase/functions/<name>/index.ts (imported once, even when two calls start together). */
export function handler(name: string): Promise<Handler> {
  if (!handlers.has(name)) {
    handlers.set(name, (async () => {
      let h: Handler | null = null;
      capture = (x) => {
        h = x;
      };
      try {
        await import(new URL(`../../functions/${name}/index.ts`, import.meta.url).href);
      } finally {
        capture = null;
      }
      if (!h) throw new Error(`${name} did not call Deno.serve`);
      return h as Handler;
    })());
  }
  return handlers.get(name)!;
}

export type Reply = { status: number; body: any };

/** Calls a function as the browser (or Moyasar, or the scheduler) would. */
export async function invoke(name: string, body: unknown, opts: { as?: string | null; email?: string; headers?: Record<string, string>; query?: string; raw?: string } = {}): Promise<Reply> {
  const h = await handler(name);
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(opts.headers ?? {}) };
  if (opts.as) headers.authorization = `Bearer ${tokenFor(opts.as, opts.email)}`;
  const req = new Request(`${env.SUPABASE_URL}/functions/v1/${name}${opts.query ? `?${opts.query}` : ''}`, {
    method: 'POST', headers, body: opts.raw ?? JSON.stringify(body ?? {}),
  });
  let res: Response;
  try {
    res = await h(req);
  } catch (e) {
    // what Deno.serve answers when a handler throws
    return { status: 500, body: { error: e instanceof Error ? e.message : String(e), uncaught: true } };
  }
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: parsed };
}

/** Moyasar's webhook for a payment (signed with our secret token). */
export function moyasarEvent(payment: MoyasarPayment, type = 'payment_paid') {
  return { id: `evt_${Math.random().toString(36).slice(2, 10)}`, type, secret_token: env.MOYASAR_WEBHOOK_SECRET, data: { id: payment.id } };
}
