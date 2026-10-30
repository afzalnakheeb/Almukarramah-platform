// Test database helper: a fresh PostgreSQL database with the Supabase stand-in and every migration, and a way to run
// SQL as anon, as a signed-in user, as the service role (server functions) or as the migration owner.
// Uses the psql binary only (no npm packages), so the tests run with plain `node --test`.
//
// Environment: PGHOST (default /var/run/postgresql), PGPORT (default 54329), PGUSER (default postgres).
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..', '..', '..');
const MIGRATIONS = join(ROOT, 'supabase', 'migrations');
const STUB = join(here, '..', 'supabase_stub.sql');
const BASELINE = join(here, '..', 'fixtures', 'live_baseline.sql');

const PGHOST = process.env.PGHOST ?? '/var/run/postgresql';
const PGPORT = process.env.PGPORT ?? '54329';
const PGUSER = process.env.PGUSER ?? 'postgres';

export type As =
  | undefined                                   // migration owner (no JWT): auth.role() is null
  | 'anon'
  | 'service'                                   // a server function using the service-role key
  | { uid: string; email?: string };            // a signed-in user

function run(db: string, args: string[], input?: string, as?: As): string {
  const options: string[] = [];
  if (as === 'anon') options.push('-c role=anon', '-c request.jwt.claim.role=anon');
  else if (as === 'service') options.push('-c role=service_role', '-c request.jwt.claim.role=service_role');
  else if (as) {
    options.push('-c role=authenticated', '-c request.jwt.claim.role=authenticated', `-c request.jwt.claim.sub=${as.uid}`);
    const claims = JSON.stringify({ sub: as.uid, role: 'authenticated', email: as.email ?? `${as.uid.slice(0, 8)}@test.local` });
    options.push(`-c request.jwt.claims=${claims.replace(/ /g, '')}`);
  }
  return execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-h', PGHOST, '-p', PGPORT, '-U', PGUSER, '-d', db, ...args], {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, PGOPTIONS: options.join(' '), PGTZ: 'UTC' },
    maxBuffer: 64 * 1024 * 1024,
  });
}

export class SqlError extends Error {}

export class Db {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }

  /** Runs SQL (any number of statements) and returns psql's raw output. Throws SqlError with the server message. */
  exec(sql: string, as?: As): string {
    try {
      return run(this.name, ['-f', '-'], sql, as);
    } catch (e) {
      const err = e as { stderr?: string; message: string };
      const msg = (err.stderr ?? err.message).split('\n').filter((l) => /ERROR|DETAIL|HINT/.test(l)).join(' ').replace(/^psql:[^:]*:\d+:\s*/, '');
      throw new SqlError(msg || err.message);
    }
  }

  /** Rows of a query (SELECT, or INSERT/UPDATE/DELETE ... RETURNING) as JSON objects. */
  rows<T = Record<string, unknown>>(query: string, as?: As): T[] {
    const q = query.trim().replace(/;$/, '');
    const isDml = /^(insert|update|delete|with)\b/i.test(q) && /\breturning\b/i.test(q);
    // jsonb prints on one line (json_agg does not), so the last line of output is the whole result
    const wrapped = isDml
      ? `with q as (${q}) select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from q;`
      : `select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from (${q}) q;`;
    const out = this.exec(wrapped, as).trim().split('\n').filter(Boolean).pop() ?? '[]';
    return JSON.parse(out) as T[];
  }

  one<T = Record<string, unknown>>(query: string, as?: As): T {
    const r = this.rows<T>(query, as);
    if (r.length !== 1) throw new Error(`expected one row, got ${r.length}: ${query}`);
    return r[0];
  }

  /** A single value: the first column of the first row. */
  val<T = unknown>(query: string, as?: As): T {
    const r = this.rows<Record<string, unknown>>(query, as);
    return (r.length ? Object.values(r[0])[0] : null) as T;
  }

  /** Number of rows a statement touched (RLS silently skips rows a policy hides). */
  count(stmt: string, as?: As): number {
    const q = stmt.trim().replace(/;$/, '');
    const body = /\breturning\b/i.test(q) ? q : `${q} returning 1`;
    return Number(this.exec(`with q as (${body}) select count(*) from q;`, as).trim().split('\n').pop());
  }

  /** The error message a statement fails with, or null when it succeeds. */
  error(sql: string, as?: As): string | null {
    try {
      this.exec(sql, as);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  }

  drop() {
    run('postgres', ['-c', `drop database if exists ${this.name} with (force)`]);
  }
}

/** A fresh database with the Supabase stand-in and every migration applied in order. */
export function freshDb(name: string, upTo?: string): Db {
  const dbName = `t_${name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;
  run('postgres', ['-c', `drop database if exists ${dbName} with (force)`]);
  run('postgres', ['-c', `create database ${dbName}`]);
  const db = new Db(dbName);
  db.exec(readFileSync(STUB, 'utf8'));
  let baseline = false;
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) {
    if (upTo && f > upTo) break;
    // the live database before the marketplace: our categories, zones and a few products (applied after 0011)
    if (!baseline && f >= '0012') {
      db.exec(readFileSync(BASELINE, 'utf8'));
      baseline = true;
    }
    try {
      db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
    } catch (e) {
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

/** Deterministic ids for test people. */
export const ids = {
  owner: '00000000-0000-4000-a000-000000000001',
  manager: '00000000-0000-4000-a000-000000000002',
  operations: '00000000-0000-4000-a000-000000000003',
  marketing: '00000000-0000-4000-a000-000000000004',
  support: '00000000-0000-4000-a000-000000000005',
  finance: '00000000-0000-4000-a000-000000000006',
  customer: '00000000-0000-4000-b000-000000000001',
  customer2: '00000000-0000-4000-b000-000000000002',
  sellerA: '00000000-0000-4000-c000-00000000000a',   // a person who runs seller A
  sellerB: '00000000-0000-4000-c000-00000000000b',
  applicant: '00000000-0000-4000-c000-0000000000cc', // signed in, no seller account yet
};
export const staffRoles = ['owner', 'manager', 'operations', 'marketing', 'support', 'finance'] as const;
export const user = (k: keyof typeof ids): As => ({ uid: ids[k], email: `${k}@test.local` });

/** People: every staff role, two customers, two seller owners and an applicant (no seller rows yet). */
export function seedPeople(db: Db) {
  const people = Object.entries(ids).map(([k, id]) => `('${id}', '${k}@test.local', now())`).join(',\n');
  db.exec(`insert into auth.users (id, email, email_confirmed_at) values ${people};
    insert into staff_members (user_id, role, name) values
      ${staffRoles.map((r) => `('${ids[r]}', '${r}', '${r}')`).join(', ')};`);
}

/**
 * Two approved Saudi marketplace sellers (A and B) created the way the website does it (apply_as_seller as the
 * person, then approval by a manager). Returns their seller ids.
 */
export function seedSellers(db: Db): { A: string; B: string } {
  const apply = (who: 'sellerA' | 'sellerB', name: string) =>
    db.val<string>(`select apply_as_seller('{"agree": true, "name_en": "${name}", "country": "SA", "city": "Madinah", "contact_name": "${name} owner", "product_summary": "Oud and attar"}'::jsonb)`, user(who));
  const A = apply('sellerA', 'Oud House A');
  const B = apply('sellerB', 'Prayer House B');
  db.exec(`update sellers set status = 'approved' where id in ('${A}', '${B}');`, user('manager'));
  return { A, B };
}
