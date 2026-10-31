// A stand-in for supabase-js, used ONLY by the Edge Function tests (edge.ts maps the functions' esm.sh import here).
// The functions' own code runs unchanged. Every database call they make is turned into SQL and run with psql on the
// local test database, as the role the real request would have (the service role, a signed-in user or anon), so
// row-level security, grants, triggers and database functions all apply exactly as written. Each call is its own
// transaction, as each PostgREST request is. Calls run concurrently (async psql), so races can be tested.
//
// What it is not: PostgREST. It covers the query-builder subset our functions use (select with embedded relations
// found from foreign keys, eq/neq/gt/gte/lt/lte/like/ilike/is/in/not/or, order, limit, single, maybeSingle, insert,
// update, delete, rpc with named arguments) and fails loudly on anything else. Storage is kept in memory. A dry run on
// a Supabase branch database remains the real check of the HTTP layer.
//
// Tests can inject faults (a call fails before or after it reaches the database) and hooks (run something just before
// a call), to reproduce partial failures and races.
import { spawn } from 'node:child_process';

export type Who = 'service' | 'anon' | { uid: string; email?: string };
export type Op = { kind: 'select' | 'insert' | 'update' | 'delete' | 'rpc'; name: string; args?: unknown; who: Who };
export type PgError = { message: string; code: string; details: string | null; hint: string | null };
export type Fault = {
  match: (op: Op) => boolean;
  /** the call fails with this error: before reaching the database, or after it committed (the answer was lost) */
  error?: { message: string; code?: string };
  after?: boolean;
  /** run just before the call (to make a concurrent change); the call then goes ahead */
  before?: () => Promise<void> | void;
  /** how many calls it applies to (default 1) */
  times?: number;
};

type Stored = { bytes: Uint8Array; type: string };
export const fake = {
  db: '',
  faults: [] as Fault[],
  log: [] as Op[],
  storage: new Map<string, Map<string, Stored>>(),
  onUpload: null as null | ((bucket: string, path: string) => Promise<void> | void),
  env: (k: string): string | undefined => process.env[k],
  reset() {
    this.faults = [];
    this.log = [];
    this.onUpload = null;
  },
};

const PGHOST = process.env.PGHOST ?? '/var/run/postgresql';
const PGPORT = process.env.PGPORT ?? '54329';
const PGUSER = process.env.PGUSER ?? 'postgres';

function pgOptions(who: Who): string {
  if (who === 'anon') return '-c role=anon -c request.jwt.claim.role=anon';
  if (who === 'service') return '-c role=service_role -c request.jwt.claim.role=service_role';
  const claims = JSON.stringify({ sub: who.uid, role: 'authenticated', email: who.email ?? `${who.uid.slice(0, 8)}@test.local` });
  return `-c role=authenticated -c request.jwt.claim.role=authenticated -c request.jwt.claim.sub=${who.uid} -c request.jwt.claims=${claims.replace(/ /g, '')}`;
}

function parseError(stderr: string): PgError {
  const m = /ERROR:\s+([0-9A-Z]{5}):\s+(.*)/.exec(stderr);
  const detail = /^DETAIL:\s+(.*)$/m.exec(stderr);
  const hint = /^HINT:\s+(.*)$/m.exec(stderr);
  return {
    message: m ? m[2].trim() : stderr.trim().split('\n').pop() ?? 'error',
    code: m ? m[1] : 'XX000',
    details: detail ? detail[1].trim() : null,
    hint: hint ? hint[1].trim() : null,
  };
}

/** Runs SQL as someone; the last line of output is returned (queries here print one JSON value). */
export function runSql(query: string, who: Who): Promise<{ out: string; error: null } | { out: null; error: PgError }> {
  return new Promise((resolve) => {
    const p = spawn('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', fake.db, '-f', '-'], {
      env: { ...process.env, PGOPTIONS: pgOptions(who), PGTZ: 'UTC' },
    });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolve(code === 0 ? { out, error: null } : { out: null, error: parseError(err) }));
    p.stdin.end(query);
  });
}

// ---------------------------------------------------------------- SQL building
const IDENT = /^[a-z_][a-z0-9_]*$/;
function ident(s: string): string {
  if (!IDENT.test(s)) throw new Error(`fake-supabase: unsupported identifier ${JSON.stringify(s)}`);
  return s;
}
export function lit(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('fake-supabase: non-finite number');
    return String(v);
  }
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
  return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
}

type Item = { kind: 'star' } | { kind: 'col'; name: string; alias: string } | { kind: 'rel'; name: string; alias: string; items: Item[] };
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
function parseSelect(s: string): Item[] {
  return splitTop(s.replace(/\s+/g, ' ')).map((p): Item => {
    if (p === '*') return { kind: 'star' };
    const m = /^(?:([A-Za-z_]\w*):)?([A-Za-z_]\w*)(?:\((.*)\))?$/s.exec(p);
    if (!m) throw new Error(`fake-supabase: unsupported select item ${p}`);
    const [, alias, name, inner] = m;
    if (inner !== undefined) return { kind: 'rel', name: ident(name), alias: alias ?? name, items: parseSelect(inner) };
    return { kind: 'col', name: ident(name), alias: alias ?? name };
  });
}

type Fk = { src: string; dst: string; srcCol: string; dstCol: string };
const fkCache = new Map<string, Fk[]>();
async function foreignKeys(): Promise<Fk[]> {
  if (!fkCache.has(fake.db)) {
    const r = await runSql(`select coalesce(jsonb_agg(jsonb_build_object('src', c.conrelid::regclass::text, 'dst', c.confrelid::regclass::text,
        'srcCol', a.attname, 'dstCol', b.attname)), '[]'::jsonb)
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_attribute b on b.attrelid = c.confrelid and b.attnum = c.confkey[1]
      where c.contype = 'f' and array_length(c.conkey, 1) = 1 and c.connamespace = 'public'::regnamespace`, 'service');
    if (r.error) throw new Error(r.error.message);
    fkCache.set(fake.db, JSON.parse(r.out.trim().split('\n').pop() ?? '[]'));
  }
  return fkCache.get(fake.db)!;
}

let aliasN = 0;
async function projection(alias: string, table: string, items: Item[]): Promise<string> {
  const parts: string[] = [];
  if (items.some((i) => i.kind === 'star')) parts.push(`to_jsonb(${alias})`);
  const cols = items.filter((i): i is Extract<Item, { kind: 'col' }> => i.kind === 'col');
  if (cols.length) parts.push(`jsonb_build_object(${cols.map((c) => `'${c.alias}', ${alias}.${c.name}`).join(', ')})`);
  for (const r of items.filter((i): i is Extract<Item, { kind: 'rel' }> => i.kind === 'rel')) {
    const fks = await foreignKeys();
    const a2 = `t${++aliasN}`;
    const child = fks.filter((f) => f.src === r.name && f.dst === table);   // the related table points here: many
    const parent = fks.filter((f) => f.src === table && f.dst === r.name);  // this table points there: one
    if (child.length + parent.length !== 1) throw new Error(`fake-supabase: no single relationship between ${table} and ${r.name}`);
    const inner = await projection(a2, r.name, r.items);
    parts.push(child.length
      ? `jsonb_build_object('${r.alias}', (select coalesce(jsonb_agg(${inner}), '[]'::jsonb) from ${r.name} ${a2} where ${a2}.${child[0].srcCol} = ${alias}.${child[0].dstCol}))`
      : `jsonb_build_object('${r.alias}', (select ${inner} from ${r.name} ${a2} where ${a2}.${parent[0].dstCol} = ${alias}.${parent[0].srcCol}))`);
  }
  return parts.length ? parts.join(' || ') : `'{}'::jsonb`;
}

function condition(alias: string, col: string, op: string, value: unknown): string {
  const c = `${alias}.${ident(col)}`;
  switch (op) {
    case 'eq': return `${c} = ${lit(value)}`;
    case 'neq': return `${c} <> ${lit(value)}`;
    case 'gt': return `${c} > ${lit(value)}`;
    case 'gte': return `${c} >= ${lit(value)}`;
    case 'lt': return `${c} < ${lit(value)}`;
    case 'lte': return `${c} <= ${lit(value)}`;
    case 'like': return `${c} like ${lit(value)}`;
    case 'ilike': return `${c} ilike ${lit(value)}`;
    case 'is': return `${c} is ${value === null || value === 'null' ? 'null' : value === true || value === 'true' ? 'true' : 'false'}`;
    case 'in': {
      const list = Array.isArray(value) ? value : String(value).replace(/^\(|\)$/g, '').split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
      return list.length ? `${c} in (${list.map(lit).join(', ')})` : 'false';
    }
    default: throw new Error(`fake-supabase: unsupported filter ${op}`);
  }
}

// ---------------------------------------------------------------- running a call (with faults)
async function perform(op: Op, query: string): Promise<{ out: string | null; error: PgError | null }> {
  fake.log.push(op);
  const f = fake.faults.find((x) => (x.times ?? 1) > 0 && x.match(op));
  if (f) {
    f.times = (f.times ?? 1) - 1;
    if (f.before) await f.before();
    if (f.error && !f.after) return { out: null, error: { message: f.error.message, code: f.error.code ?? 'XX000', details: null, hint: null } };
    const r = await runSql(query, op.who);
    if (f.error && f.after) return { out: null, error: { message: f.error.message, code: f.error.code ?? 'XX000', details: null, hint: null } };
    return r;
  }
  return runSql(query, op.who);
}
const lastJson = (out: string | null) => {
  const line = (out ?? '').trim().split('\n').filter(Boolean).pop();
  return line === undefined || line === '' ? null : JSON.parse(line);
};

type Result = { data: any; error: PgError | null; count?: number | null; status: number };

class Query implements PromiseLike<Result> {
  readonly who: Who;
  readonly table: string;
  kind: 'select' | 'insert' | 'update' | 'delete' = 'select';
  cols = '*';
  returning: string | null = null;
  values: unknown = null;
  filters: string[] = [];
  orders: string[] = [];
  limitN: number | null = null;
  one: 'single' | 'maybe' | null = null;
  head = false;
  countMode: string | null = null;

  constructor(who: Who, table: string) {
    this.who = who;
    this.table = ident(table);
  }
  select(cols = '*', opts: { count?: string; head?: boolean } = {}) {
    if (this.kind === 'select') {
      this.cols = cols;
      this.head = !!opts.head;
      this.countMode = opts.count ?? null;
    } else this.returning = cols;
    return this;
  }
  insert(values: unknown) { this.kind = 'insert'; this.values = values; return this; }
  update(values: unknown) { this.kind = 'update'; this.values = values; return this; }
  delete() { this.kind = 'delete'; return this; }
  upsert(): never { throw new Error('fake-supabase: upsert is not supported'); }
  eq(c: string, v: unknown) { this.filters.push(condition('t0', c, 'eq', v)); return this; }
  neq(c: string, v: unknown) { this.filters.push(condition('t0', c, 'neq', v)); return this; }
  gt(c: string, v: unknown) { this.filters.push(condition('t0', c, 'gt', v)); return this; }
  gte(c: string, v: unknown) { this.filters.push(condition('t0', c, 'gte', v)); return this; }
  lt(c: string, v: unknown) { this.filters.push(condition('t0', c, 'lt', v)); return this; }
  lte(c: string, v: unknown) { this.filters.push(condition('t0', c, 'lte', v)); return this; }
  like(c: string, v: unknown) { this.filters.push(condition('t0', c, 'like', v)); return this; }
  ilike(c: string, v: unknown) { this.filters.push(condition('t0', c, 'ilike', v)); return this; }
  is(c: string, v: unknown) { this.filters.push(condition('t0', c, 'is', v)); return this; }
  in(c: string, v: unknown[]) { this.filters.push(condition('t0', c, 'in', v)); return this; }
  not(c: string, op: string, v: unknown) { this.filters.push(`not (${condition('t0', c, op, v)})`); return this; }
  or(expr: string) {
    const parts = splitTop(expr).map((p) => {
      const m = /^([a-z_][a-z0-9_]*)\.(eq|neq|gt|gte|lt|lte|is|in|like|ilike)\.(.*)$/s.exec(p);
      if (!m) throw new Error(`fake-supabase: unsupported or() part ${p}`);
      return condition('t0', m[1], m[2], m[3]);
    });
    this.filters.push(`(${parts.join(' or ')})`);
    return this;
  }
  order(c: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.orders.push(`t0.${ident(c)} ${opts.ascending === false ? 'desc' : 'asc'}${opts.nullsFirst === undefined ? '' : opts.nullsFirst ? ' nulls first' : ' nulls last'}`);
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }

  async run(): Promise<Result> {
    const where = this.filters.length ? `where ${this.filters.join(' and ')}` : '';
    let query: string;
    if (this.kind === 'select') {
      const proj = await projection('t0', this.table, parseSelect(this.cols));
      const ord = this.orders.length ? `order by ${this.orders.join(', ')}` : '';
      query = `select coalesce(jsonb_agg(x.j order by x.n), '[]'::jsonb) from (
        select ${proj} as j, row_number() over (${ord || 'order by (select 1)'}) as n from ${this.table} t0 ${where} ${ord} ${this.limitN === null ? '' : `limit ${Math.floor(this.limitN)}`}) x;`;
    } else {
      let body: string;
      if (this.kind === 'insert') {
        const rows = (Array.isArray(this.values) ? this.values : [this.values]) as Record<string, unknown>[];
        const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))].map(ident);
        body = `insert into ${this.table} (${cols.join(', ')}) select ${cols.join(', ')} from jsonb_populate_recordset(null::${this.table}, ${lit(rows)}) returning *`;
      } else if (this.kind === 'update') {
        const v = this.values as Record<string, unknown>;
        const cols = Object.keys(v).map(ident);
        body = `update ${this.table} as t0 set ${cols.map((c) => `${c} = j.${c}`).join(', ')} from jsonb_populate_record(null::${this.table}, ${lit(v)}) as j ${where} returning t0.*`;
      } else {
        body = `delete from ${this.table} as t0 ${where} returning t0.*`;
      }
      const proj = this.returning ? await projection('t0', this.table, parseSelect(this.returning)) : `'{}'::jsonb`;
      query = `with w as (${body}) select coalesce(jsonb_agg(${proj}), '[]'::jsonb) from w t0;`;
    }
    const r = await perform({ kind: this.kind, name: this.table, args: this.values ?? undefined, who: this.who }, query);
    if (r.error) return { data: null, error: r.error, status: 400 };
    let rows = lastJson(r.out) as unknown[];
    if (this.kind !== 'select' && !this.returning) return { data: null, error: null, status: 201 };
    if (this.head) return { data: null, error: null, count: rows.length, status: 200 };
    if (this.one) {
      if (rows.length > 1 || (rows.length === 0 && this.one === 'single')) {
        return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: `The result contains ${rows.length} rows`, hint: null }, status: 406 };
      }
      return { data: rows[0] ?? null, error: null, status: 200 };
    }
    if (this.countMode) return { data: rows, error: null, count: rows.length, status: 200 };
    return { data: rows, error: null, status: 200 };
  }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return this.run().then(ok, bad);
  }
}

// ---------------------------------------------------------------- rpc
type FnMeta = { names: string[]; types: string[]; cats: string[]; defaults: number; retset: boolean; rettype: string };
const fnCache = new Map<string, FnMeta[]>();
async function fnMeta(name: string): Promise<FnMeta[]> {
  const key = `${fake.db}:${name}`;
  if (!fnCache.has(key)) {
    const r = await runSql(`select coalesce(jsonb_agg(jsonb_build_object('names', coalesce(p.proargnames, '{}'),
        'types', array(select format_type(t, null) from unnest(p.proargtypes) t),
        'cats', array(select (select typcategory from pg_type where oid = t)::text from unnest(p.proargtypes) t),
        'defaults', p.pronargdefaults, 'retset', p.proretset, 'rettype', format_type(p.prorettype, null))), '[]'::jsonb)
      from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = ${lit(ident(name))};`, 'service');
    if (r.error) throw new Error(r.error.message);
    fnCache.set(key, JSON.parse(r.out.trim().split('\n').pop() ?? '[]'));
  }
  return fnCache.get(key)!;
}

async function rpc(who: Who, name: string, args: Record<string, unknown> = {}): Promise<Result> {
  const given = Object.keys(args);
  const metas = (await fnMeta(name)).filter((m) => given.every((g) => m.names.includes(g))
    && m.names.slice(0, m.names.length - m.defaults).every((n) => given.includes(n)));
  if (metas.length !== 1) {
    return { data: null, error: { message: `Could not find the function public.${name}(${given.join(', ')}) in the schema cache`, code: 'PGRST202', details: null, hint: null }, status: 404 };
  }
  const m = metas[0];
  const expr = given.map((n) => {
    const i = m.names.indexOf(n);
    const t = m.types[i];
    if (t === 'json' || t === 'jsonb') return `${n} => nullif(a.j -> '${n}', 'null'::jsonb)::${t}`;
    if (m.cats[i] === 'A') return `${n} => (case when jsonb_typeof(a.j -> '${n}') = 'array' then array(select jsonb_array_elements_text(a.j -> '${n}')) end)::${t}`;
    return `${n} => (a.j ->> '${n}')::${t}`;
  }).join(', ');
  const call = `public.${ident(name)}(${expr})`;
  const query = m.retset
    ? `with a as (select ${lit(args)} as j) select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) from a, ${call} r;`
    : m.rettype === 'void'
      ? `with a as (select ${lit(args)} as j) select ${call} from a;`
      : `with a as (select ${lit(args)} as j) select to_jsonb(${call}) from a;`;
  const r = await perform({ kind: 'rpc', name, args, who }, query);
  if (r.error) return { data: null, error: r.error, status: 400 };
  return { data: m.rettype === 'void' ? null : lastJson(r.out), error: null, status: 200 };
}

// ---------------------------------------------------------------- auth and storage
/** A test session token: what caller() hands to auth.getUser. */
export function tokenFor(uid: string, email?: string): string {
  return `test.${Buffer.from(JSON.stringify({ sub: uid, email: email ?? `${uid.slice(0, 8)}@test.local` })).toString('base64url')}`;
}
function parseToken(t: string | null | undefined): { sub: string; email: string } | null {
  if (!t?.startsWith('test.')) return null;
  try {
    const u = JSON.parse(Buffer.from(t.slice(5), 'base64url').toString('utf8'));
    return typeof u.sub === 'string' ? u : null;
  } catch {
    return null;
  }
}

function bucket(name: string) {
  if (!fake.storage.has(name)) fake.storage.set(name, new Map());
  const files = fake.storage.get(name)!;
  const base = fake.env('SUPABASE_URL') ?? 'https://project.supabase.test';
  return {
    async upload(path: string, body: Uint8Array | Blob | ArrayBuffer, opts: { contentType?: string; upsert?: boolean } = {}) {
      if (fake.onUpload) await fake.onUpload(name, path);
      if (files.has(path) && !opts.upsert) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
      const bytes = body instanceof Blob ? new Uint8Array(await body.arrayBuffer()) : body instanceof ArrayBuffer ? new Uint8Array(body) : new Uint8Array(body);
      files.set(path, { bytes, type: opts.contentType ?? (body instanceof Blob ? body.type : 'application/octet-stream') });
      return { data: { path }, error: null };
    },
    async download(path: string) {
      const f = files.get(path);
      return f ? { data: new Blob([f.bytes], { type: f.type }), error: null } : { data: null, error: { message: 'Object not found', statusCode: '404' } };
    },
    getPublicUrl(path: string) {
      return { data: { publicUrl: `${base}/storage/v1/object/public/${name}/${path}` } };
    },
    async createSignedUrl(path: string, expires: number) {
      return files.has(path) ? { data: { signedUrl: `${base}/storage/v1/object/sign/${name}/${path}?token=test&expires=${expires}` }, error: null } : { data: null, error: { message: 'Object not found' } };
    },
    async remove(paths: string[]) {
      for (const p of paths) files.delete(p);
      return { data: paths.map((p) => ({ name: p })), error: null };
    },
  };
}

class FakeClient {
  readonly who: Who;
  readonly auth = {
    getUser: async (token?: string) => {
      const u = parseToken(token);
      return u ? { data: { user: { id: u.sub, email: u.email } }, error: null } : { data: { user: null }, error: { message: 'invalid JWT' } };
    },
  };
  readonly storage = { from: (b: string) => bucket(b) };
  constructor(who: Who) {
    this.who = who;
  }
  from(table: string) { return new Query(this.who, table); }
  rpc(name: string, args?: Record<string, unknown>) { return rpc(this.who, name, args); }
}

export type SupabaseClient = FakeClient;

/** supabase-js's createClient: the service-role key acts as the server; a signed-in user's token acts as them. */
export function createClient(_url: string, key: string, opts: { global?: { headers?: Record<string, string> } } = {}): FakeClient {
  const auth = opts.global?.headers?.Authorization ?? opts.global?.headers?.authorization ?? '';
  const u = parseToken(auth.replace(/^Bearer\s+/i, ''));
  if (u) return new FakeClient({ uid: u.sub, email: u.email });
  return new FakeClient(key === fake.env('SUPABASE_SERVICE_ROLE_KEY') ? 'service' : 'anon');
}
