// After the sale: everything people write to each other goes through here so contact details are masked before they
// are stored (contact.ts), then the database decides (who may, when, how much): messages, return requests and answers,
// reviews and replies, and our team's moderation (which also publishes approved review photos to the catalogue).
// The database functions called here are server-only and take the caller's id; nothing is trusted from the browser.
import { cleanText, mergeFlags } from '../_shared/aftersale.ts';
import { admin, caller, handle, json, staffRole, UUID } from '../_shared/util.ts';

type Body = Record<string, unknown> & { action?: string };
const id = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null);
const ids = (v: unknown, max: number) => (Array.isArray(v) ? v.map(id).filter((x): x is string => !!x).slice(0, max) : []);

Deno.serve(handle(async (req) => {
  const user = await caller(req);
  if (!user) return json({ error: 'Please sign in' }, 401);
  const body = (await req.json()) as Body;
  const db = admin();
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) return json({ error: error.message }, 400);
    return json(data);
  };

  switch (body.action) {
    case 'message': {
      const text = cleanText(body.body, 2000);
      if (!text.text) return json({ error: 'Write a message' }, 400);
      const subject = cleanText(body.subject, 140);
      const as = body.as === 'seller' || body.as === 'staff' ? body.as : 'customer';
      return rpc('mp_post_message', {
        p_user: user.id,
        p: {
          as, thread_id: id(body.threadId), return_id: id(body.returnId), sub_order_id: id(body.subOrderId), product_id: id(body.productId),
          subject: subject.text || null, body: text.text, masked: text.masked + subject.masked, flags: mergeFlags(text, subject),
        },
      });
    }

    case 'return_request': {
      const details = cleanText(body.details, 2000);
      const lines = Array.isArray(body.lines)
        ? (body.lines as { orderItemId?: unknown; quantity?: unknown }[]).slice(0, 50)
          .map((l) => ({ order_item_id: id(l.orderItemId), quantity: Math.max(0, Math.floor(Number(l.quantity) || 0)) }))
          .filter((l) => l.order_item_id && l.quantity > 0)
        : [];
      return rpc('mp_return_request', {
        p_user: user.id,
        p: { sub_order_id: id(body.subOrderId), reason: String(body.reason ?? ''), unopened: body.unopened === true, details: details.text || null,
             lines, photos: ids(body.photos, 4), flags: details.flags },
      });
    }

    case 'return_action': {
      const note = cleanText(body.note, 1000);
      return rpc('mp_return_action', {
        p_user: user.id, p_return: id(body.returnId), p_action: String(body.do ?? ''), p_note: note.text || null,
        p_restock: typeof body.restock === 'boolean' ? body.restock : null, p_flags: note.flags,
      });
    }

    case 'review': {
      const title = cleanText(body.title, 120);
      const text = cleanText(body.body, 2000);
      const name = cleanText(body.name, 60);
      return rpc('mp_submit_review', {
        p_user: user.id,
        p: { order_item_id: id(body.orderItemId), rating: Number(body.rating), title: title.text || null, body: text.text, lang: body.lang === 'en' ? 'en' : 'ar',
             name: name.masked ? null : name.text || null, photos: ids(body.photos, 3), flags: mergeFlags(title, text, name) },
      });
    }

    case 'reply': {
      const text = cleanText(body.body, 1500);
      return rpc('mp_reply_review', { p_user: user.id, p_review: id(body.reviewId), p_body: text.text, p_flags: text.flags });
    }

    case 'moderate': {
      // our team (owner, manager, marketing, support): the database checks the role again
      const role = await staffRole(db, user.id);
      if (!role || !['owner', 'manager', 'marketing', 'support'].includes(role)) return json({ error: 'Not allowed' }, 403);
      const reviewId = id(body.reviewId);
      const target = body.target === 'reply' ? 'reply' : 'review';
      const action = String(body.do ?? '');
      let urls: string[] | null = null;
      if (reviewId && target === 'review' && action === 'publish') {
        // the review's screened photos are copied to the public catalogue (anything blocked or rejected is left out)
        const { data: r } = await db.from('product_reviews').select('id, photos').eq('id', reviewId).single();
        const { data: assets } = await db.from('media_assets').select('id, bucket, path, mime, status')
          .in('id', (r?.photos as string[] | null) ?? []).in('status', ['passed', 'review']).not('path', 'is', null);
        urls = [];
        for (const [n, a] of (assets ?? []).entries()) {
          const { data: blob } = await db.storage.from(a.bucket).download(a.path);
          if (!blob) continue;
          const ext = a.mime === 'image/png' ? 'png' : a.mime === 'image/webp' ? 'webp' : 'jpg';
          const dest = `reviews/${reviewId}/${n + 1}.${ext}`;
          const { error } = await db.storage.from('catalogue').upload(dest, blob, { contentType: a.mime, upsert: true });
          if (error) throw error;
          urls.push(db.storage.from('catalogue').getPublicUrl(dest).data.publicUrl);
        }
      }
      return rpc('mp_moderate_review', {
        p_user: user.id, p_review: reviewId, p_target: target, p_action: action, p_note: cleanText(body.note, 500).text || null, p_photo_urls: urls,
      });
    }

    default:
      return json({ error: 'Unknown action' }, 400);
  }
}));
