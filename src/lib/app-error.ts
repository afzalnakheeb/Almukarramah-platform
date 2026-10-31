// Errors for the person using the app, in English and Arabic (review M8). No imports, so the tests load it directly.

let current: 'en' | 'ar' = 'en';
/** The app's language for the errors built here; the I18nProvider keeps it up to date. */
export function setErrorLanguage(l: 'en' | 'ar') {
  current = l;
}

const ARABIC = /[\u0600-\u06FF]/;
const GENERIC = { en: 'Something went wrong. Please try again.', ar: 'حدث خطأ. يُرجى المحاولة مرة أخرى.' };
const OFFLINE = { en: 'Could not reach Al Mukarramah. Please check your connection and try again.', ar: 'تعذّر الاتصال بالمكرمة. تحقق من اتصالك وحاول مرة أخرى.' };

/**
 * An error for the person using the app, in English and Arabic (review M8). Its message is already in the app's
 * language, so screens show `e.message` as before; `code`, `status` and `body` carry what the server sent.
 */
export class AppError extends Error {
  readonly en: string;
  readonly ar: string;
  readonly code: string | null;
  readonly status: number | null;
  readonly body: Record<string, unknown> | null;
  constructor(p: { en: string; ar?: string | null; code?: string | null; status?: number | null; body?: Record<string, unknown> | null }) {
    // a message the server sent only in English still reaches an Arabic reader, after a sentence in Arabic
    const ar = p.ar && ARABIC.test(p.ar) ? p.ar : p.en === GENERIC.en ? GENERIC.ar : `${GENERIC.ar}\n${p.en}`;
    super(current === 'ar' ? ar : p.en);
    this.name = 'AppError';
    this.en = p.en;
    this.ar = ar;
    this.code = p.code ?? null;
    this.status = p.status ?? null;
    this.body = p.body ?? null;
  }
}

/** A database error (a direct call): our functions put the Arabic in the error's detail. */
export function fromDb(error: { message: string; details?: string | null; code?: string | null }): AppError {
  return new AppError({ en: error.message, ar: error.details && ARABIC.test(error.details) ? error.details : null, code: error.code ?? null });
}

/** A server function's error: its JSON answer ({ error, error_ar, code }), or a bilingual message when there is none. */
export async function fromFunction(error: unknown): Promise<AppError> {
  const ctx = (error as { context?: unknown } | null)?.context as { status?: number; clone?: () => { json: () => Promise<unknown> }; json?: () => Promise<unknown> } | undefined;
  if (ctx && typeof ctx.status === 'number') {
    let body: Record<string, unknown> | null = null;
    try {
      const r = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
      const parsed = await (r as { json: () => Promise<unknown> }).json();
      body = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      body = null;
    }
    if (body && typeof body.error === 'string') {
      return new AppError({ en: body.error, ar: typeof body.error_ar === 'string' ? body.error_ar : null, code: typeof body.code === 'string' ? body.code : null, status: ctx.status, body });
    }
    return new AppError({ ...GENERIC, status: ctx.status });
  }
  return new AppError(OFFLINE);
}

