// Image intake: the real type from the bytes, size limits, pixel size, hidden metadata removed (keeping only a phone
// photo's orientation), animations refused, hashes for de-duplication. Images are built byte by byte here.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { intakeImage, MAX_IMAGE_BYTES, sniffType } from '../functions/_shared/images.ts';

const enc = (s: string) => [...s].map((c) => c.charCodeAt(0));
const u16 = (n: number) => [n >> 8, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const le32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
const has = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s, 'latin1'));

function crc32(bytes: number[]): number {
  let c = ~0;
  for (const x of bytes) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}

/** A JPEG skeleton: SOI, JFIF, optional EXIF (orientation + a description), a comment, SOF0, SOS, some data, EOI. */
function jpeg(w: number, h: number, opts: { orientation?: number; secret?: string } = {}): Uint8Array {
  const out: number[] = [0xff, 0xd8];
  out.push(0xff, 0xe0, ...u16(16), ...enc('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0);
  if (opts.orientation || opts.secret) {
    const desc = enc(`${opts.secret ?? 'x'}\0`);
    const entries = 2;
    const ifdLen = 2 + entries * 12 + 4;
    const tiff = [...enc('MM'), 0, 42, ...u32(8), ...u16(entries),
      ...u16(0x0112), ...u16(3), ...u32(1), ...u16(opts.orientation ?? 1), 0, 0,
      ...u16(0x010e), ...u16(2), ...u32(desc.length), ...u32(8 + ifdLen),
      ...u32(0), ...desc];
    const body = [...enc('Exif\0\0'), ...tiff];
    out.push(0xff, 0xe1, ...u16(body.length + 2), ...body);
  }
  const com = enc(opts.secret ? `camera ${opts.secret}` : 'hello');
  out.push(0xff, 0xfe, ...u16(com.length + 2), ...com);
  out.push(0xff, 0xc0, ...u16(17), 8, ...u16(h), ...u16(w), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  out.push(0xff, 0xda, ...u16(12), 3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0);
  out.push(0x12, 0x34, 0x56, 0x78, 0x9a, 0xff, 0x00, 0xbc);
  out.push(0xff, 0xd9);
  return new Uint8Array(out);
}

function pngChunk(type: string, data: number[]): number[] {
  const td = [...enc(type), ...data];
  return [...u32(data.length), ...td, ...u32(crc32(td))];
}
function png(w: number, h: number, opts: { secret?: string; animated?: boolean } = {}): Uint8Array {
  const out = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  out.push(...pngChunk('IHDR', [...u32(w), ...u32(h), 8, 2, 0, 0, 0]));
  if (opts.animated) out.push(...pngChunk('acTL', [...u32(2), ...u32(0)]));
  if (opts.secret) out.push(...pngChunk('tEXt', [...enc('Comment\0'), ...enc(opts.secret)]));
  out.push(...pngChunk('IDAT', [1, 2, 3, 4]));
  out.push(...pngChunk('IEND', []));
  return new Uint8Array(out);
}

function webp(w: number, h: number, opts: { secret?: string } = {}): Uint8Array {
  const chunk = (type: string, data: number[]) => [...enc(type), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])];
  const flags = opts.secret ? 0x08 | 0x04 : 0;
  const vp8x = chunk('VP8X', [flags, 0, 0, 0, (w - 1) & 0xff, ((w - 1) >> 8) & 0xff, ((w - 1) >> 16) & 0xff, (h - 1) & 0xff, ((h - 1) >> 8) & 0xff, ((h - 1) >> 16) & 0xff]);
  const bits = ((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14);
  const vp8l = chunk('VP8L', [0x2f, ...le32(bits), 0, 0, 0]);
  const extra = opts.secret ? [...chunk('EXIF', enc(opts.secret)), ...chunk('XMP ', enc(`<x>${opts.secret}</x>`))] : [];
  const body = [...enc('WEBP'), ...vp8x, ...extra, ...vp8l];
  return new Uint8Array([...enc('RIFF'), ...le32(body.length), ...body]);
}

describe('image intake', () => {
  test('the type comes from the bytes', () => {
    assert.equal(sniffType(jpeg(10, 10)), 'image/jpeg');
    assert.equal(sniffType(png(10, 10)), 'image/png');
    assert.equal(sniffType(webp(10, 10)), 'image/webp');
    assert.equal(sniffType(new Uint8Array(enc('GIF89a........'))), null);
  });

  test('JPEG: size read, location and camera data removed, orientation kept, size reported as displayed', async () => {
    const r = await intakeImage(jpeg(2400, 1800, { orientation: 6, secret: 'GPS-24.4672N-39.6111E' }), 'image/jpeg');
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.mime, 'image/jpeg');
    assert.deepEqual([r.width, r.height], [1800, 2400], 'rotated 90 degrees on display');
    assert.equal(has(r.bytes, 'GPS-24.4672N'), false);
    assert.equal(has(r.bytes, 'camera'), false, 'comments removed');
    assert.equal(has(r.bytes, 'Exif'), true, 'a minimal EXIF block keeps the orientation');
    assert.ok(r.strippedBytes > 0);
    const again = await intakeImage(r.bytes, 'image/jpeg');
    assert.ok(again.ok && again.width === 1800 && again.height === 2400, 'the cleaned file still reads the same way');
    assert.ok(again.ok && again.sha256 === r.sha256, 'cleaning is stable');
  });

  test('the same photo with different hidden data hashes the same (de-duplication)', async () => {
    const a = await intakeImage(jpeg(1600, 1600, { secret: 'phone-A' }));
    const b = await intakeImage(jpeg(1600, 1600, { secret: 'phone-B, another place' }));
    assert.ok(a.ok && b.ok);
    if (a.ok && b.ok) assert.equal(a.sha256, b.sha256);
    const c = await intakeImage(jpeg(1600, 1601));
    assert.ok(c.ok && a.ok && c.sha256 !== a.sha256);
  });

  test('PNG: text chunks removed, animation refused', async () => {
    const r = await intakeImage(png(2000, 1500, { secret: 'SECRET-LOCATION' }), 'image/png');
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual([r.width, r.height], [2000, 1500]);
      assert.equal(has(r.bytes, 'SECRET-LOCATION'), false);
      assert.equal(has(r.bytes, 'IDAT'), true);
    }
    const a = await intakeImage(png(2000, 1500, { animated: true }));
    assert.equal(a.ok, false);
    if (!a.ok) assert.equal(a.code, 'animated');
  });

  test('WebP: EXIF and XMP removed, their flags cleared, the RIFF size updated', async () => {
    const r = await intakeImage(webp(1800, 1200, { secret: 'SECRET-LOCATION' }), 'image/webp');
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual([r.width, r.height], [1800, 1200]);
    assert.equal(has(r.bytes, 'SECRET-LOCATION'), false);
    const flags = r.bytes[20];
    assert.equal(flags & 0x0c, 0);
    const riff = r.bytes[4] | (r.bytes[5] << 8) | (r.bytes[6] << 16) | (r.bytes[7] << 24);
    assert.equal(riff, r.bytes.length - 8);
  });

  test('refusals carry reasons in English and Arabic', async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(jpeg(10, 10));
    const tooBig = await intakeImage(big);
    assert.ok(!tooBig.ok && tooBig.code === 'too_large' && /١٠/.test(tooBig.ar));
    const gif = await intakeImage(new Uint8Array(enc('GIF89a....................')));
    assert.ok(!gif.ok && gif.code === 'not_image');
    const lie = await intakeImage(jpeg(2000, 2000), 'image/png');
    assert.ok(!lie.ok && lie.code === 'type_mismatch');
    const tiny = await intakeImage(jpeg(120, 90));
    assert.ok(!tiny.ok && tiny.code === 'too_small');
    const broken = await intakeImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 200, 1, 2]));
    assert.ok(!broken.ok && broken.code === 'corrupt');
  });
});
