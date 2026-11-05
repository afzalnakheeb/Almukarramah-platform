// /investors: the investor room. The investor film, the pitch deck, and the investor deck, feasibility study and
// financial model to download, behind their own passcode (separate from /decks), for invited investors.
// The passcode check, the 30-day cookie and the protection of the files are on the server (api/investors.ts,
// middleware.ts). The film, deck and documents are added at build time from an encrypted bundle
// (scripts/decks-media.mjs), never this public repo, and the passcode is not in this page's code: the server returns
// it only to visitors who typed it, for the share message.
//
// Locked, the page is a doorway: an arch of fine gold lines (the house's arch) holding the passcode. Open, a stone
// screening room for the film, then the deck, the documents and sharing. Ivory and gold throughout, no black surfaces.
// Without the server (a local preview, or the API unreachable) the page stays locked, and pressing Enter says the
// passcode could not be checked.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { Corners, Glow, Ornament } from '@/components/decor';
import { Icon } from '@/components/icons';
import { data } from '@/components/motion';
import { Seo } from '@/components/seo';
import { Button, Container, Serif, T, useWide } from '@/components/ui';
import { useI18n, type Key } from '@/lib/i18n';
import { SITE_URL } from '@/lib/images';
import { colors, sans } from '@/theme';

const API = '/api/investors';
const PAGE = `${SITE_URL}/investors`;
const EMAIL = 'hello@almukarramah.com';
const FILM = {
  hd: '/investors/film/al-mukarramah-investor-film-v9-1080p.mp4',
  sd: '/investors/film/al-mukarramah-investor-film-v9-720p.mp4',
  poster: '/investors/film/poster.jpg',
};
const DECK = '/investors/deck';
const DECK_COVER = '/investors/deck/cover.jpg';
type Doc = { href: string; label: Key; type: Key };
const DOCS: Doc[] = [
  { href: '/investors/files/Al-Mukarramah-investor-deck.pdf', label: 'investorsDocDeck', type: 'investorsTypePdf' },
  { href: '/investors/files/Al-Mukarramah-feasibility-study.pdf', label: 'investorsDocStudy', type: 'investorsTypePdf' },
  { href: '/investors/files/Al-Mukarramah-financial-model.xlsx', label: 'investorsDocModel', type: 'investorsTypeExcel' },
];

type Phase = 'checking' | 'locked' | 'open';
/** Whether a private file is in this build (they are added from the bundle at build time), and its size if known. */
type Found = { ok: boolean; bytes?: number };

/** Where to go after unlocking, if the visitor arrived from a private link (only paths inside /investors/). */
function nextPath(): string | null {
  if (typeof window === 'undefined') return null;
  const n = new URLSearchParams(window.location.search).get('next');
  return n && /^\/investors\/[A-Za-z0-9/_.-]+$/.test(n) && !n.includes('..') ? n : null;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(area);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Asks for a private file without downloading it: is it in this build, and how large is it? */
async function probe(path: string): Promise<Found> {
  try {
    const r = await fetch(path, { method: 'HEAD', credentials: 'same-origin', cache: 'no-store' });
    const bytes = Number(r.headers.get('content-length'));
    return { ok: r.ok, bytes: r.ok && bytes > 0 ? bytes : undefined };
  } catch {
    return { ok: false };
  }
}

/** "2.4 MB" / "٢٫٤ ميغابايت". */
function sizeLabel(bytes: number | undefined, lang: string, t: (k: Key) => string): string | null {
  if (!bytes) return null;
  const mb = bytes >= 1e6;
  const n = new Intl.NumberFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { maximumFractionDigits: mb && bytes < 1e7 ? 1 : 0 })
    .format(mb ? bytes / 1e6 : Math.max(1, bytes / 1e3));
  return t(mb ? 'investorsSizeMB' : 'investorsSizeKB').replace('{n}', n);
}

export default function Investors() {
  const { t, isRTL } = useI18n();
  const wide = useWide();
  const web = Platform.OS === 'web';
  const [phase, setPhase] = useState<Phase>('checking');
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [found, setFound] = useState<Record<string, Found>>({});
  const [canShare, setCanShare] = useState(false);

  // Is this visitor unlocked? The cookie is HttpOnly, so the page asks the server. If the server cannot be reached,
  // the page stays locked.
  useEffect(() => {
    if (!web) return;
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
    let live = true;
    fetch(API, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => r.json())
      .then((j: { unlocked?: boolean; code?: string }) => {
        if (!live) return;
        if (j.unlocked && j.code) {
          setCode(j.code);
          setPhase('open');
        } else setPhase('locked');
      })
      .catch(() => live && setPhase('locked'));
    return () => { live = false; };
  }, [web]);

  // Once open, check which of the film, the deck and the documents this build holds.
  useEffect(() => {
    if (phase !== 'open') return;
    let live = true;
    const paths = [FILM.hd, FILM.sd, DECK, ...DOCS.map((d) => d.href)];
    Promise.all(paths.map(async (p) => [p, await probe(p)] as const)).then((rows) => {
      if (live) setFound(Object.fromEntries(rows));
    });
    return () => { live = false; };
  }, [phase]);

  useEffect(() => {
    if (!note) return;
    const id = setTimeout(() => setNote(null), 3500);
    return () => clearTimeout(id);
  }, [note]);

  const unlock = async () => {
    if (busy || !typed.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(API, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: typed }),
      });
      const j = (await r.json().catch(() => ({}))) as { unlocked?: boolean; code?: string };
      if (r.ok && j.unlocked && j.code) {
        const next = nextPath();
        if (next) {
          window.location.assign(next);
          return;
        }
        setCode(j.code);
        setTyped('');
        setPhase('open');
      } else setError(r.status === 401 ? t('investorsWrong') : t('investorsError'));
    } catch {
      setError(t('investorsError'));
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    await fetch(API, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    setCode(null);
    setFound({});
    setPhase('locked');
  };

  const codeLine = code ? t('investorsShareCode').replace('{code}', code) : '';
  const message = code ? `${t('investorsShareLine')}\n${PAGE}\n${codeLine}` : '';
  const enc = encodeURIComponent;
  // Private channels only: the investor set is confidential, so there are no public posts (unlike /decks).
  const targets = useMemo(() => [
    { key: 'whatsapp', label: t('investorsWhatsApp'), href: `https://wa.me/?text=${enc(message)}` },
    { key: 'telegram', label: t('investorsTelegram'), href: `https://t.me/share/url?url=${enc(PAGE)}&text=${enc(`${t('investorsShareLine')}\n${codeLine}`)}` },
    { key: 'email', label: t('investorsEmail'), href: `mailto:?subject=${enc(t('investorsShareSubject'))}&body=${enc(message)}` },
  ], [message, codeLine, t]);

  const share = (href: string) => {
    if (href.startsWith('mailto:')) window.location.href = href;
    else window.open(href, '_blank', 'noopener,noreferrer');
  };

  const shareMore = async () => {
    try {
      await navigator.share({ title: t('investorsShareSubject'), text: `${t('investorsShareLine')}\n${codeLine}`, url: PAGE });
    } catch {
      /* the visitor closed the share sheet */
    }
  };

  const copyMessage = async () => {
    if (await copyText(message)) setNote(t('investorsCopied'));
  };

  const seo = (
    <Seo
      title={t('investorsSeoTitle')}
      description={t('investorsSeoDescription')}
      path="/investors"
      image="/images/hero-light.jpg"
      noindex
    />
  );

  // The iPhone and Android apps send visitors to the website, where the film plays and the documents download.
  if (!web) {
    return (
      <Screen>
        {seo}
        <View style={{ gap: 14, paddingTop: 24 }}>
          <Serif size={34} role="h1">{t('investorsTitle')}</Serif>
          <T size={15} lh={1.6} color={colors.body}>{t('investorsAppOnly')}</T>
          <Button label="almukarramah.com/investors" onPress={() => Linking.openURL(PAGE)} />
        </View>
      </Screen>
    );
  }

  const passcodeForm = (
    <View style={{ width: '100%', maxWidth: 400, gap: 10, marginTop: wide ? 28 : 22 }}>
      <T w={600} size={11} caps color={colors.brassText} center>{t('investorsPasscode')}</T>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 10 }}>
        {/* Letters or digits: the server reads Arabic-Indic digits as 0–9 and ignores spaces. */}
        <TextInput
          value={typed}
          onChangeText={(v) => { setTyped(v); setError(null); }}
          onSubmitEditing={unlock}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType="go"
          maxLength={64}
          accessibilityLabel={t('investorsPasscode')}
          placeholder="• • • •"
          placeholderTextColor={colors.muted}
          {...data({ field: error ? 'error' : 1 })}
          style={[sans(500, isRTL), {
            flex: wide ? 1 : undefined, minWidth: 0, minHeight: 56, paddingHorizontal: 18, borderWidth: 1, borderRadius: 1,
            borderColor: error ? colors.danger : colors.inputLine, backgroundColor: colors.white,
            color: colors.ink, fontSize: 20, letterSpacing: 6, textAlign: 'center', writingDirection: 'ltr',
          }]}
        />
        <Button label={busy ? t('investorsChecking') : t('investorsUnlock')} onPress={unlock} busy={busy} disabled={!typed.trim()}
          size="lg" full={!wide} style={wide ? { flexShrink: 0 } : undefined} />
      </View>
      <View accessibilityLiveRegion="polite" style={{ minHeight: 20 }}>
        {error ? <T size={13} lh={1.5} w={500} color={colors.danger} center>{error}</T> : <T size={13} lh={1.5} color={colors.muted} center>{t('investorsPasscodeHint')}</T>}
      </View>
    </View>
  );

  if (phase !== 'open') {
    // Locked: a doorway of two fine gold arches, lit softly from the crown, with the passcode inside.
    return (
      <Screen padded={false}>
        {seo}
        <View style={{ paddingTop: wide ? 56 : 28, paddingBottom: wide ? 80 : 48 }}>
          <Container>
            <View style={{ width: '100%', maxWidth: wide ? 560 : 440, alignSelf: 'center' }}>
              <View style={s.archOuter}>
                <View style={s.archInner}>
                  <Glow color={colors.goldBright} opacity={0.26} cx="50%" cy="0%" r="85%" />
                  <View style={{ alignItems: 'center', paddingTop: wide ? 86 : 60, paddingBottom: wide ? 44 : 30, paddingHorizontal: wide ? 48 : 20 }}>
                    <Icon name="lock" size={wide ? 24 : 22} stroke={1.2} color={colors.brass} />
                    <Serif size={wide ? 52 : 36} role="h1" center style={{ marginTop: wide ? 22 : 16 }}>{t('investorsTitle')}</Serif>
                    <Ornament width={wide ? 104 : 84} align="center" style={{ marginTop: wide ? 18 : 14 }} />
                    <T size={wide ? 16 : 15} lh={1.65} color={colors.body} center style={{ maxWidth: 380, marginTop: wide ? 18 : 14 }}>{t('investorsIntro')}</T>
                    {phase === 'checking' ? <ActivityIndicator color={colors.brass} style={{ marginTop: 34, marginBottom: 14 }} /> : passcodeForm}
                  </View>
                </View>
              </View>
            </View>
          </Container>
        </View>
      </Screen>
    );
  }

  const hd = found[FILM.hd];
  const sd = found[FILM.sd];
  const film = !hd || !sd ? (
    <ActivityIndicator color={colors.brass} />
  ) : !hd.ok && !sd.ok ? (
    <View style={{ alignItems: 'center', gap: 16, paddingHorizontal: 24 }}>
      <Ornament width={88} align="center" />
      <T size={15} lh={1.6} color={colors.body} center>{t('investorsFilmSoon')}</T>
    </View>
  ) : (
    <video controls playsInline preload="metadata" poster={FILM.poster} aria-label={t('investorsFilm')} controlsList="nodownload"
      style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain', background: colors.sand }}>
      {hd.ok && sd.ok ? (
        <>
          <source src={FILM.sd} type="video/mp4" media="(max-width: 760px)" />
          <source src={FILM.hd} type="video/mp4" />
        </>
      ) : (
        <source src={hd.ok ? FILM.hd : FILM.sd} type="video/mp4" />
      )}
    </video>
  );
  const deckMissing = found[DECK]?.ok === false;

  return (
    <Screen padded={false}>
      {seo}
      {/* Open: the screening room, in stone. */}
      <View style={{ backgroundColor: colors.stone, borderBottomWidth: 1, borderColor: colors.goldLine }}>
        <Container style={{ paddingTop: wide ? 56 : 32, paddingBottom: wide ? 72 : 40, gap: wide ? 40 : 26 }}>
          <View style={{ alignItems: 'center', gap: wide ? 14 : 10 }}>
            <Serif size={wide ? 52 : 34} role="h1" center>{t('investorsTitle')}</Serif>
            <Ornament width={wide ? 104 : 84} align="center" />
            <T size={wide ? 16 : 15} lh={1.65} color={colors.body} center style={{ maxWidth: 560 }}>{t('investorsIntro')}</T>
          </View>
          <View style={{ width: '100%', maxWidth: 1040, alignSelf: 'center' }}>
            <Corners at={['ts', 'be']} len={wide ? 22 : 14} inset={wide ? -12 : -7} />
            <View style={{ borderWidth: 1, borderColor: colors.goldLine, padding: wide ? 6 : 4, backgroundColor: colors.ivory }}>
              <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: colors.sand, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {film}
              </View>
            </View>
          </View>
        </Container>
      </View>

      {/* The animated deck comes first: it is how we present. */}
      <Container style={{ paddingTop: wide ? 64 : 40 }}>
        {deckMissing ? (
          <View style={{ gap: 10 }}>
            <Serif size={wide ? 34 : 26} role="h2">{t('investorsDeck')}</Serif>
            <T size={14} lh={1.6} color={colors.muted}>{t('investorsDeckSoon')}</T>
          </View>
        ) : (
          <a href={DECK} style={{ textDecoration: 'none' }} aria-label={t('investorsOpenDeck')}>
            <View {...data({ hover: 'door' })} style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: wide ? 44 : 18, borderWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.ivory, padding: wide ? 8 : 6 }}>
              <View style={{ flex: wide ? 7 : undefined, width: wide ? undefined : '100%', aspectRatio: 16 / 9, backgroundColor: colors.sand, overflow: 'hidden' }}>
                <img src={DECK_COVER} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </View>
              <View style={{ flex: wide ? 5 : undefined, gap: 12, paddingHorizontal: wide ? 8 : 12, paddingRight: wide ? 36 : 12, paddingBottom: wide ? 0 : 16 }}>
                <T w={600} size={11} caps color={colors.brassText}>{t('investorsDeckKicker')}</T>
                <Serif size={wide ? 40 : 28} role="h2">{t('investorsDeck')}</Serif>
                <T size={15} lh={1.65} color={colors.body}>{t('investorsDeckBody')}</T>
                <View {...data({ btn: 'primary' })} style={{ alignSelf: wide ? 'flex-start' : 'stretch', alignItems: 'center', marginTop: 10, minHeight: 56, paddingHorizontal: 34, justifyContent: 'center', borderRadius: 1, borderWidth: 1, borderColor: colors.emerald, backgroundColor: colors.emerald }}>
                  <T w={isRTL ? 500 : 600} size={12.5} caps color={colors.ivory}>{t('investorsOpenDeck')}</T>
                </View>
              </View>
            </View>
          </a>
        )}
      </Container>

      <Container style={{ paddingTop: wide ? 64 : 40, paddingBottom: wide ? 88 : 56, gap: wide ? 64 : 44 }}>
        <View style={{ gap: 0 }}>
          <View style={{ gap: 12, maxWidth: 820 }}>
            <Serif size={wide ? 34 : 26} role="h2">{t('investorsDocuments')}</Serif>
            <T size={15} lh={1.65} color={colors.body}>{t('investorsDocumentsBody')}</T>
            <View style={{ marginTop: 10, borderTopWidth: 1, borderColor: colors.goldLine }}>
              {DOCS.map((d) => <DocRow key={d.href} doc={d} found={found[d.href]} />)}
            </View>
          </View>
        </View>

        {/* The confidentiality line, under the documents it qualifies. */}
        <View style={{ alignItems: 'center', gap: 18 }}>
          <Ornament width={wide ? 104 : 84} align="center" />
          <Serif size={wide ? 28 : 22} center>{t('investorsConfidential')}</Serif>
        </View>

        <View style={{ gap: 14 }}>
          <Serif size={wide ? 34 : 26} role="h2">{t('investorsShare')}</Serif>
          <T size={15} lh={1.6} color={colors.body}>{t('investorsShareBody')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
            {targets.map((x) => <SharePill key={x.key} label={x.label} onPress={() => share(x.href)} />)}
            <SharePill label={t('investorsCopy')} onPress={copyMessage} />
            {canShare && <SharePill label={t('investorsMore')} onPress={shareMore} />}
          </View>
          <View accessibilityLiveRegion="polite" style={{ minHeight: 22 }}>
            {note ? <T size={13} w={500} color={colors.success}>{note}</T> : null}
          </View>
          <View style={{ backgroundColor: colors.porcelain, borderStartWidth: 2, borderColor: colors.gold, paddingVertical: 14, paddingHorizontal: 16 }}>
            <T size={13.5} lh={1.6} color={colors.body} style={{ writingDirection: isRTL ? 'rtl' : 'ltr' }}>{message}</T>
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 20, flexDirection: wide ? 'row' : 'column', justifyContent: 'space-between', alignItems: wide ? 'center' : 'flex-start', gap: 14 }}>
          <T size={13.5} lh={1.6} color={colors.body}>
            {t('investorsQuestions')}{' '}
            <a href={`mailto:${EMAIL}`} dir="ltr" style={{ color: colors.emerald, textDecorationColor: colors.goldLine, textUnderlineOffset: 3 }}>{EMAIL}</a>
          </T>
          <Pressable accessibilityRole="button" onPress={lock} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="lock" size={14} stroke={1.4} color={colors.brass} />
            <T w={600} size={11} caps color={colors.brassText}>{t('investorsLock')}</T>
          </Pressable>
        </View>
      </Container>
    </Screen>
  );
}

/** One document: its name, its file type and size, and the download (or "being prepared" if this build lacks it). */
function DocRow({ doc, found }: { doc: Doc; found?: Found }) {
  const { t, lang } = useI18n();
  const missing = found?.ok === false;
  const size = sizeLabel(found?.bytes, lang, t);
  const row = (
    <View {...data({ hover: missing ? undefined : 'door' })} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 84, paddingVertical: 16, borderBottomWidth: 1, borderColor: colors.hair }}>
      <View style={{ flex: 1, gap: 8 }}>
        <View {...data({ ul: missing ? undefined : 'start' })} style={{ alignSelf: 'flex-start' }}>
          <Serif size={23} color={missing ? colors.muted : colors.navy}>{t(doc.label)}</Serif>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ borderWidth: 1, borderColor: colors.goldLine, paddingHorizontal: 7, paddingVertical: 2 }}>
            <T w={600} size={10.5} color={colors.brassText} style={{ letterSpacing: 0.8 }}>{t(doc.type)}</T>
          </View>
          {size ? <T size={12.5} color={colors.muted}>{size}</T> : null}
        </View>
      </View>
      {missing ? (
        <T size={12.5} color={colors.muted}>{t('investorsDocSoon')}</T>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="download" size={18} stroke={1.4} color={colors.emerald} />
          <T w={600} size={11} caps color={colors.emerald}>{t('investorsDownload')}</T>
        </View>
      )}
    </View>
  );
  if (missing) return row;
  return (
    <a href={doc.href} download={doc.href.slice(doc.href.lastIndexOf('/') + 1)} style={{ textDecoration: 'none', display: 'block' }}>
      {row}
    </a>
  );
}

function SharePill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 999,
        borderWidth: 1, borderColor: colors.goldLine, backgroundColor: pressed ? colors.goldSoft : colors.porcelain,
      })}>
      <T w={600} size={12.5} color={colors.navy}>{label}</T>
    </Pressable>
  );
}

const s = StyleSheet.create({
  // Two arches, 7 px apart: the inner one sits exactly inside the outer one (same centre), like a carved doorway.
  archOuter: { borderWidth: 1, borderColor: colors.goldLine, borderTopLeftRadius: 999, borderTopRightRadius: 999, padding: 6 },
  archInner: { borderWidth: 1, borderColor: colors.hair, borderTopLeftRadius: 999, borderTopRightRadius: 999, backgroundColor: colors.porcelain, overflow: 'hidden' },
});
