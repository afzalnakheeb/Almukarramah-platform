// Adds the private media to the web export, after it is built (Vercel builds only):
//   dist/decks/      the pitch deck and film for /decks                          (a tar of deck/ and film/)
//   dist/investors/  the investor film, deck and documents for /investors     (a tar of deck/, film/ and files/)
//
// They are not in this repository's code. Each bundle is a tar encrypted with AES-256-GCM (12-byte IV, ciphertext,
// 16-byte tag), split into parts under 50 MB and kept on its own media branch (shots/media-decks, shots/media-investors);
// scripts/decks-media.json and scripts/investors-media.json list the parts with their SHA-256. Without the key the parts
// are unreadable. Both bundles use the same key: the Vercel environment variable DECKS_MEDIA_KEY (32 bytes, base64).
// On Vercel the files are then served only to visitors with that area's passcode (middleware.ts).
//
// Without the key (local builds, forks) this step does nothing. It never fails the build: if a bundle cannot be
// fetched or opened, the shop still deploys and its page says the film is being finished, until the next build.
// The bundles are handled one after the other and independently, so a problem with one never holds back the other.
import { createDecipheriv, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BUNDLES = [
  { name: 'decks', what: 'the private deck and film' },
  { name: 'investors', what: 'the private investor film, deck and documents' },
];

async function unpack({ name, what }) {
  const OUT = join('dist', name);
  const CACHE = join('node_modules', '.cache', name);
  const key = process.env.DECKS_MEDIA_KEY;
  if (!key) return console.log(`${name}: DECKS_MEDIA_KEY is not set, so ${what} are skipped`);
  const m = JSON.parse(readFileSync(join('scripts', `${name}-media.json`), 'utf8'));
  if (!m.parts?.length) return console.log(`${name}: no media bundle published yet`);
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
  console.log(`${name}: unpacked bundle ${m.version} (${(tar.length / 1e6).toFixed(1)} MB) into ${OUT}`);
}

for (const b of BUNDLES) {
  await unpack(b).catch((e) => console.warn(`${b.name}: WARNING, ${b.what} are not included in this build: ${e.message}`));
}
