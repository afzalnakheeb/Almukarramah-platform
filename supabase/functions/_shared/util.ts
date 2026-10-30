// Shared helpers for Supabase Edge Functions (Deno).
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export function env(name: string, required = true): string {
  const v = Deno.env.get(name);
  if (!v && required) throw new Error(`Missing secret ${name}`);
  return v ?? '';
}

/** Service-role client: bypasses row-level security. Use only on the server. */
export function admin(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

/** The signed-in user calling the function, if any. */
export async function caller(req: Request) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;
  const { data } = await admin().auth.getUser(token);
  return data.user ?? null;
}

export async function staffRole(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.from('staff_members').select('role').eq('user_id', userId).maybeSingle();
  return data?.role ?? null;
}

export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
    try {
      return await fn(req);
    } catch (e) {
      console.error(e);
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  };
}

export type Db = SupabaseClient;

/** VAT contained in a VAT-inclusive amount. */
export function vatIncluded(totalInclMinor: number, rateBp: number): number {
  return Math.round((totalInclMinor * rateBp) / (10000 + rateBp));
}

export async function fxPerSar(db: Db, currency: string): Promise<number> {
  if (currency === 'SAR') return 1;
  const { data } = await db.from('fx_rates').select('per_sar').eq('currency', currency).single();
  if (!data) throw new Error(`No exchange rate for ${currency}`);
  return Number(data.per_sar);
}

/** A client acting as the signed-in caller (row-level security applies), for RPCs that check auth.uid(). */
export function asCaller(req: Request): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false },
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

/** Whether the user is a member of the seller account. */
export async function isSellerMember(db: Db, sellerId: string, userId: string): Promise<boolean> {
  const { data } = await db.from('seller_members').select('user_id').eq('seller_id', sellerId).eq('user_id', userId).maybeSingle();
  return !!data;
}

/** Scheduled jobs and staff tools share a secret header. */
export function cronAuthorized(req: Request): boolean {
  const s = Deno.env.get('CRON_SECRET');
  return !!s && req.headers.get('x-cron-secret') === s;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Counts one use against a limit (marketplace rate limits); true while within it. */
export async function withinLimit(db: Db, key: string, windowSeconds: number, limit: number): Promise<boolean> {
  const { data, error } = await db.rpc('mp_rate_hit', { p_key: key, p_window_seconds: windowSeconds, p_limit: limit });
  if (error) throw error;
  return data === true;
}
