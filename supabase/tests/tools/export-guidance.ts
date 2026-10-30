// Writes src/generated/market-guidance.json from the migrations (category tree, policies, the Islamic standard),
// so the seller handbook is pre-rendered with real content before the marketplace is switched on. After switch-on,
// scripts/build-catalogue.mjs refreshes the same file from the live database at every build.
// Usage: node supabase/tests/tools/export-guidance.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { freshDb, ROOT } from '../lib/db.ts';

const db = freshDb('export_guidance');
try {
  const g = db.val<Record<string, unknown>>(`select mp_guidance()`, 'anon');
  const out = join(ROOT, 'src', 'generated', 'market-guidance.json');
  writeFileSync(out, JSON.stringify({ ...g, generated_at: 'from migrations' }, null, 1) + '\n');
  console.log(`wrote ${out}`);
} finally {
  db.drop();
}
