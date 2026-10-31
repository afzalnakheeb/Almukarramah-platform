// Screening flows with storage and database access, shared by screen-image, listing-check and screening-retry, so a
// retry runs exactly the same code as the first attempt.
import { claudeCaller, imageBlock, screeningModels } from './claude.ts';
import { scoreListing, type QualityPhoto } from './quality.ts';
import { screenImage, screenListing, type ModelCall, type Rule, type ScreeningSettings } from './screening.ts';
import type { Db } from './util.ts';

export type Settings = ScreeningSettings & {
  strike_limit: number; quarantine_retention_days: number; uploads_per_hour: number; listing_checks_per_day: number;
  min_quality_score: number; quality_weights: Record<string, number>;
};
export type Asset = {
  id: string; seller_id: string | null; kind: string; bucket: string; path: string | null; mime: string; width: number | null; height: number | null;
  sha256: string; status: string; attempts: number;
};

export async function screeningSetup(db: Db) {
  const [{ data: rules, error: e1 }, { data: settings, error: e2 }] = await Promise.all([
    db.from('policy_rules').select('code, level, severity, applies_to, title_en, title_ar, ai_instruction, keywords').eq('active', true).order('sort'),
    db.from('mp_settings').select('*').eq('id', 1).single(),
  ]);
  if (e1 || e2 || !settings) throw new Error('screening settings unavailable');
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  // no key means no checks: everything stays pending (never passed unchecked)
  const call: ModelCall = key ? claudeCaller(key) : async () => { throw new Error('ANTHROPIC_API_KEY is not set'); };
  return { rules: (rules ?? []) as Rule[], settings: settings as Settings, models: screeningModels((n) => Deno.env.get(n)), call };
}

/** The photo as the model sees it: inline when small, a downscaled copy when the project can resize, else a short link. */
export async function modelImage(db: Db, bucket: string, path: string, mime: string): Promise<unknown> {
  const store = db.storage.from(bucket);
  const { data: blob } = await store.download(path);
  if (blob && blob.size <= 3_750_000) return imageBlock({ bytes: new Uint8Array(await blob.arrayBuffer()), mime });
  try {
    const { data: small } = await store.download(path, { transform: { width: 1600, height: 1600, resize: 'contain', quality: 85 } });
    if (small && small.size <= 3_750_000) return imageBlock({ bytes: new Uint8Array(await small.arrayBuffer()), mime: small.type || 'image/jpeg' });
  } catch { /* image transformations not enabled on this project */ }
  const { data: signed } = await store.createSignedUrl(path, 600);
  if (!signed?.signedUrl) throw new Error('photo not readable');
  return imageBlock({ mime, url: signed.signedUrl });
}

/** Screens one stored asset and applies the result: rejected files are removed, prohibited ones quarantined. */
export async function screenAsset(db: Db, asset: Asset, ctx: { fashion?: boolean; listing?: { name_en?: string; category?: string } | null } = {}) {
  if (!asset.path) throw new Error('asset has no file');
  const setup = await screeningSetup(db);
  let image: unknown;
  try {
    image = await modelImage(db, asset.bucket, asset.path, asset.mime);
  } catch (e) {
    await db.rpc('mp_record_image_screening', { p_asset: asset.id, p_runs: [], p_outcome: { status: 'pending', error: String((e as Error).message) } });
    return { status: 'pending' as const, reasons: [] };
  }
  const { runs, outcome } = await screenImage({
    image, ctx: { kind: asset.kind as 'listing_photo', fashion: ctx.fashion, listing: ctx.listing ?? null },
    rules: setup.rules, settings: setup.settings, models: setup.models, call: setup.call,
  });
  const apply: Record<string, unknown> = { ...outcome };
  if (outcome.status === 'rejected') {
    await db.storage.from(asset.bucket).remove([asset.path]);
    apply.path = null;
  } else if (outcome.status === 'blocked') {
    // quarantine: staff only, deleted after the retention period
    const { data: blob } = await db.storage.from(asset.bucket).download(asset.path);
    const q = `${asset.seller_id ?? 'customers'}/${asset.id}.${asset.path.split('.').pop()}`;
    if (blob) await db.storage.from('quarantine').upload(q, blob, { contentType: asset.mime, upsert: true });
    await db.storage.from(asset.bucket).remove([asset.path]);
    apply.path = q;
    apply.bucket = 'quarantine';
  }
  const { error } = await db.rpc('mp_record_image_screening', { p_asset: asset.id, p_runs: runs, p_outcome: apply });
  if (error) throw error;
  return { status: outcome.status, reasons: outcome.reasons, flags: outcome.flags };
}

type Context = {
  product: Record<string, unknown> & { id: string; seller_id: string; updated_at: string; listing_status: string; images: string[] | null };
  seller: { id: string; country: string; status: string; kind: string } | null;
  requirements: { policy: Record<string, unknown>; attributes: { key: string; label_en: string; label_ar: string; type: string; required: boolean }[] } | null;
  photos: { path: string; position: number; asset: { id: string; status: string; flags: string[]; width: number | null; height: number | null; mime: string; bucket: string; path: string | null } | null }[];
  documents: { doc_type: string; status: string }[];
  categories: { slug: string; name_en: string; name_ar: string }[];
  settings: Settings;
  /** the listing's options (review M2) and whether the seller is new to us (review M14) */
  variants?: { label_en: string; label_ar: string; price_minor: number | null; is_active: boolean }[];
  new_seller?: boolean;
};

/** The quality score as the server sees it (photo sizes and flags from the screening records). */
export function serverQuality(c: Context) {
  const p = c.product;
  const pol = (c.requirements?.policy ?? {}) as Record<string, unknown>;
  const photos: QualityPhoto[] = c.photos.map((x) => ({
    longSidePx: x.asset?.width && x.asset?.height ? Math.max(x.asset.width, x.asset.height) : null,
    status: (x.asset?.status ?? 'error') as QualityPhoto['status'],
    flags: (x.asset?.flags ?? []) as QualityPhoto['flags'],
  }));
  return scoreListing({
    nameEn: String(p.name_en ?? ''), nameAr: String(p.name_ar ?? ''), descriptionEn: String(p.description_en ?? ''), descriptionAr: String(p.description_ar ?? ''),
    priceMinor: Number(p.base_price_sar ?? 0), photos, attributes: (p.attributes ?? {}) as Record<string, unknown>,
    categoryAttributes: c.requirements?.attributes ?? [],
    policy: {
      min_photos: Number(pol.min_photos ?? 3), min_long_side_px: Number(pol.min_long_side_px ?? 1600), min_price_minor: (pol.min_price_minor as number | null) ?? null,
      min_shelf_days: (pol.min_shelf_days as number | null) ?? null, required_documents: (pol.required_documents as string[]) ?? [],
      allow_made_to_measure: pol.allow_made_to_measure === true,
    },
    documents: c.documents.map((d) => d.doc_type), madeToMeasure: p.made_to_measure === true,
    tailoring: (p.tailoring ?? null) as never, weights: c.settings.quality_weights, minScore: c.settings.min_quality_score,
  });
}

export async function checkContext(db: Db, productId: string): Promise<Context | null> {
  const { data, error } = await db.rpc('mp_listing_check_context', { p_product: productId });
  if (error) throw error;
  return data as Context | null;
}

/** The full check of a submitted listing (already moved to check_pending). Records the result; never passes on error. */
export async function runListingCheck(db: Db, c: Context) {
  const setup = await screeningSetup(db);
  const p = c.product;
  const pol = (c.requirements?.policy ?? {}) as Record<string, unknown>;
  const quality = serverQuality(c);
  const images = await Promise.all(c.photos.slice(0, 6).map(async (ph) => {
    let block: unknown;
    try { if (ph.asset?.path) block = await modelImage(db, ph.asset.bucket, ph.asset.path, ph.asset.mime); } catch { block = undefined; }
    return { position: ph.position, status: ph.asset?.status ?? 'pending', block };
  }));
  const path = ((pol.path as { name_en: string }[] | undefined) ?? []).map((x) => x.name_en);
  const { runs, decision } = await screenListing({
    listing: {
      name_en: String(p.name_en ?? ''), name_ar: String(p.name_ar ?? ''), description_en: String(p.description_en ?? ''), description_ar: String(p.description_ar ?? ''),
      category_path: path, category_slug: String(pol.slug ?? ''), price_sar: (Number(p.base_price_sar ?? 0) / 100).toFixed(2),
      attributes: (p.attributes ?? {}) as Record<string, unknown>, made_to_measure: p.made_to_measure === true, seller_country: c.seller?.country ?? '',
      photo_count: c.photos.length,
    },
    images, quality, rules: setup.rules, documents: c.documents.map((d) => d.doc_type), alwaysReview: pol.always_review === true,
    categories: c.categories, settings: setup.settings, models: setup.models, call: setup.call,
    variants: (c.variants ?? []).map((v) => ({ label_en: v.label_en, label_ar: v.label_ar, price_minor: v.price_minor })), newSeller: c.new_seller !== false,
  });
  const outcome = {
    verdict: decision.verdict, summary_en: decision.summary_en, summary_ar: decision.summary_ar, reasons: decision.reasons,
    draft: decision.draft ?? null, quality_score: decision.quality_score ?? quality.score, strike: decision.strike ?? null, policy_code: decision.policy_code ?? null,
  };
  const { data, error } = await db.rpc('mp_record_listing_screening', { p_product: p.id, p_expect_updated: p.updated_at, p_runs: runs, p_outcome: outcome });
  if (error) throw error;
  return { decision, applied: data as { applied: boolean; status?: string } };
}
