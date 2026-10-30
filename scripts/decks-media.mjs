// Adds the private pitch deck and film to dist/decks/ after the web export (Vercel builds only).
//
// They are not in this repository's code. The bundle is a tar of deck/ and film/, encrypted with AES-256-GCM
// (12-byte IV, ciphertext, 16-byte tag), split into parts under 50 MB and kept on the media branch (shots/media-decks);
// scripts/decks-media.json lists the parts with their SHA-256. Without the key the parts are unreadable.
// The key is the Vercel environment variable DECKS_MEDIA_KEY (32 bytes, base64).
// On Vercel the files under /decks/ are then served only to visitors with the passcode (middleware.ts).
//
// Without the key (local builds, forks) this step does nothing. It never fails the build: if the bundle cannot be
// fetched or opened, the shop still deploys and /decks says the film is being finished, until the next build.
import { createDecipheriv, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join('dist', 'decks');
const CACHE = join('node_modules', '.cache', 'decks');

async function main() {
  const key = process.env.DECKS_MEDIA_KEY;
  if (!key) return console.log('decks: DECKS_MEDIA_KEY is not set, so the private deck and film are skipped');
  const m = JSON.parse(readFileSync(join('scripts', 'decks-media.json'), 'utf8'));
  if (!m.parts?.length) return console.log('decks: no media bundle published yet');
  if (!existsSync('dist')) throw new Error('dist/ not found: run after the web export');

  const cached = join(CACHE, `${m.sha256}.enc`);
  let blob;
  if (existsSync(cached)) blob = readFileSync(cached);
  else {
    const parts = [];
    for (const part of m.parts) {
      const res = await fetch(part.url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`download failed: HTTP ${res.status} for ${part.url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (createHash('sha256').update(buf).digest('hex') !== part.sha256) throw new Error(`part checksum mismatch: ${part.url}`);
      parts.push(buf);
    }
    blob = Buffer.concat(parts);
  }
  const sha = createHash('sha256').update(blob).digest('hex');
  if (sha !== m.sha256) throw new Error(`bundle checksum mismatch (${sha})`);
  if (!existsSync(cached)) {
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(cached, blob);
  }

  const k = Buffer.from(key, 'base64');
  if (k.length !== 32) throw new Error('DECKS_MEDIA_KEY must be 32 bytes, base64-encoded');
  const decipher = createDecipheriv('aes-256-gcm', k, blob.subarray(0, 12));
  decipher.setAuthTag(blob.subarray(blob.length - 16));
  const tar = Buffer.concat([decipher.update(blob.subarray(12, blob.length - 16)), decipher.final()]);

  mkdirSync(OUT, { recursive: true });
  const r = spawnSync('tar', ['-x', '-C', OUT, '--no-same-owner', '-f', '-'], { input: tar, maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`tar failed: ${String(r.stderr).slice(0, 300)}`);
  console.log(`decks: unpacked bundle ${m.version} (${(tar.length / 1e6).toFixed(1)} MB) into ${OUT}`);
}

main().catch((e) => console.warn(`decks: WARNING, the private deck and film are not included in this build: ${e.message}`));
