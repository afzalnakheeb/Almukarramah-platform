// Image intake for screening, without any image library: the real type from the file's own bytes (never the name or
// the declared type), its pixel size, removal of hidden metadata (EXIF, GPS location, XMP, IPTC, comments) and a
// SHA-256 hash for de-duplication. Runs in Deno (edge functions) and Node (tests).
//
// JPEG keeps JFIF (APP0), the colour profile (APP2) and Adobe (APP14) segments; the orientation of a phone photo is
// kept in a minimal EXIF block holding nothing else, so the picture is not shown sideways. PNG drops text, time and
// EXIF chunks; WebP drops EXIF and XMP chunks and clears their flags.

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MIN_IMAGE_SIDE = 200;

export type Intake =
  | { ok: true; mime: ImageType; ext: 'jpg' | 'png' | 'webp'; width: number; height: number; bytes: Uint8Array; sha256: string; strippedBytes: number }
  | { ok: false; code: 'too_large' | 'not_image' | 'type_mismatch' | 'animated' | 'too_small' | 'corrupt'; en: string; ar: string };

export function sniffType(b: Uint8Array): ImageType | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length > 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp';
  return null;
}

function ascii(b: Uint8Array, at: number, n: number): string {
  let s = '';
  for (let i = at; i < at + n && i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}
const be16 = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const be32 = (b: Uint8Array, i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const le16 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const le24 = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const le32 = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---------------------------------------------------------------- JPEG
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const KEEP_APP = new Set([0xe0, 0xe2, 0xee]);   // JFIF, ICC profile, Adobe

type JpegSeg = { marker: number; start: number; end: number };
function jpegSegments(b: Uint8Array): { segs: JpegSeg[]; scanStart: number } | null {
  const segs: JpegSeg[] = [];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }                 // fill byte
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    if (m === 0xd9) return { segs, scanStart: i };     // end of image before any scan
    const len = be16(b, i + 2);
    if (len < 2 || i + 2 + len > b.length) return null;
    if (m === 0xda) return { segs, scanStart: i };     // start of scan: the rest is image data
    segs.push({ marker: m, start: i, end: i + 2 + len });
    i += 2 + len;
  }
  return null;
}

/** EXIF orientation (1-8) from an APP1 segment, if it has one. */
function exifOrientation(b: Uint8Array, seg: JpegSeg): number | null {
  const p = seg.start + 4;
  if (ascii(b, p, 6) !== 'Exif\0\0') return null;
  const t = p + 6;
  const little = ascii(b, t, 2) === 'II';
  const r16 = (i: number) => (little ? le16(b, i) : be16(b, i));
  const r32 = (i: number) => (little ? le32(b, i) : be32(b, i));
  if (r16(t + 2) !== 42) return null;
  const ifd = t + r32(t + 4);
  if (ifd + 2 > seg.end) return null;
  const n = r16(ifd);
  for (let k = 0; k < n; k++) {
    const e = ifd + 2 + k * 12;
    if (e + 12 > seg.end) return null;
    if (r16(e) === 0x0112) {
      const v = r16(e + 8);
      return v >= 1 && v <= 8 ? v : null;
    }
  }
  return null;
}

/** A minimal big-endian EXIF APP1 segment holding only the orientation tag. */
function orientationSegment(o: number): Uint8Array {
  const tiff = [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, o, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];   // "Exif\0\0"
  const len = body.length + 2;
  return new Uint8Array([0xff, 0xe1, len >> 8, len & 0xff, ...body]);
}

function jpegInfo(b: Uint8Array): { width: number; height: number; cleaned: Uint8Array } | null {
  const parsed = jpegSegments(b);
  if (!parsed) return null;
  let width = 0;
  let height = 0;
  let orientation: number | null = null;
  const keep: Uint8Array[] = [b.subarray(0, 2)];
  for (const s of parsed.segs) {
    if (SOF.has(s.marker)) { height = be16(b, s.start + 5); width = be16(b, s.start + 7); }
    if (s.marker === 0xe1 && orientation === null) orientation = exifOrientation(b, s);
    const metadata = (s.marker >= 0xe1 && s.marker <= 0xef && !KEEP_APP.has(s.marker)) || s.marker === 0xfe;
    if (!metadata) keep.push(b.subarray(s.start, s.end));
  }
  if (!width || !height) return null;
  if (orientation && orientation !== 1) keep.splice(keep.length > 1 && be16(keep[1], 0) === 0xffe0 ? 2 : 1, 0, orientationSegment(orientation));
  keep.push(b.subarray(parsed.scanStart));
  // a sideways phone photo is displayed rotated: report the size people will see
  const swap = orientation !== null && orientation >= 5;
  return { width: swap ? height : width, height: swap ? width : height, cleaned: concat(keep) };
}

// ---------------------------------------------------------------- PNG
const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME']);
function pngInfo(b: Uint8Array): { width: number; height: number; cleaned: Uint8Array; animated: boolean } | null {
  let i = 8;
  let width = 0;
  let height = 0;
  let animated = false;
  const keep: Uint8Array[] = [b.subarray(0, 8)];
  while (i + 12 <= b.length) {
    const len = be32(b, i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) return null;
    if (type === 'IHDR') { width = be32(b, i + 8); height = be32(b, i + 12); }
    if (type === 'acTL') animated = true;
    if (!PNG_DROP.has(type)) keep.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  if (!width || !height) return null;
  return { width, height, cleaned: concat(keep), animated };
}

// ---------------------------------------------------------------- WebP
function webpInfo(b: Uint8Array): { width: number; height: number; cleaned: Uint8Array; animated: boolean } | null {
  let i = 12;
  let width = 0;
  let height = 0;
  let animated = false;
  const keep: Uint8Array[] = [];
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const size = le32(b, i + 4);
    const end = i + 8 + size + (size & 1);
    if (i + 8 + size > b.length) return null;
    const d = i + 8;
    if (type === 'VP8X') { width = le24(b, d + 4) + 1; height = le24(b, d + 7) + 1; animated = (b[d] & 0x02) !== 0; }
    else if (type === 'VP8 ' && !width) {
      if (b[d + 3] !== 0x9d || b[d + 4] !== 0x01 || b[d + 5] !== 0x2a) return null;
      width = le16(b, d + 6) & 0x3fff;
      height = le16(b, d + 8) & 0x3fff;
    } else if (type === 'VP8L' && !width) {
      if (b[d] !== 0x2f) return null;
      const bits = le32(b, d + 1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    }
    if (type === 'ANIM' || type === 'ANMF') animated = true;
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = b.slice(i, Math.min(end, b.length));
      if (type === 'VP8X') chunk[8] &= ~(0x08 | 0x04);   // no EXIF, no XMP any more
      keep.push(chunk);
    }
    i = end;
  }
  if (!width || !height) return null;
  const body = concat(keep);
  const head = new Uint8Array(12);
  head.set(b.subarray(0, 12));
  const riff = body.length + 4;
  head[4] = riff & 0xff; head[5] = (riff >> 8) & 0xff; head[6] = (riff >> 16) & 0xff; head[7] = (riff >>> 24) & 0xff;
  return { width, height, cleaned: concat([head, body]), animated };
}

export async function sha256Hex(b: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new Uint8Array(b));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Checks an uploaded file and returns the cleaned bytes to store, or why it is refused (English and Arabic). */
export async function intakeImage(bytes: Uint8Array, declaredType?: string | null): Promise<Intake> {
  if (bytes.length > MAX_IMAGE_BYTES) {
    return { ok: false, code: 'too_large', en: 'Photos can be up to 10 MB.', ar: 'الحد الأقصى لحجم الصورة ١٠ ميغابايت.' };
  }
  const mime = sniffType(bytes);
  if (!mime) return { ok: false, code: 'not_image', en: 'Only JPEG, PNG or WebP photos are accepted.', ar: 'لا تُقبل إلا صور JPEG أو PNG أو WebP.' };
  if (declaredType && declaredType !== mime && !(declaredType === 'image/jpg' && mime === 'image/jpeg')) {
    return { ok: false, code: 'type_mismatch', en: 'The file is not the kind of image its name says. Please export it again as JPEG, PNG or WebP.', ar: 'نوع الملف لا يطابق اسمه. صدّر الصورة من جديد بصيغة JPEG أو PNG أو WebP.' };
  }
  const info = mime === 'image/jpeg' ? jpegInfo(bytes) : mime === 'image/png' ? pngInfo(bytes) : webpInfo(bytes);
  if (!info) return { ok: false, code: 'corrupt', en: 'This image file could not be read. Please export it again.', ar: 'تعذّرت قراءة ملف الصورة. صدّره من جديد.' };
  if ('animated' in info && info.animated) return { ok: false, code: 'animated', en: 'Photos must be still images, not animations.', ar: 'يجب أن تكون الصور ثابتة لا متحركة.' };
  if (Math.min(info.width, info.height) < MIN_IMAGE_SIDE) {
    return { ok: false, code: 'too_small', en: `This photo is too small (${info.width} × ${info.height} px).`, ar: `هذه الصورة صغيرة جدًا (${info.width} × ${info.height} بكسل).` };
  }
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
  return { ok: true, mime, ext, width: info.width, height: info.height, bytes: info.cleaned, sha256: await sha256Hex(info.cleaned), strippedBytes: bytes.length - info.cleaned.length };
}
