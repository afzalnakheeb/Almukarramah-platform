// /decks: the Al Mukarramah pitch deck and film, behind a passcode, for investors and partners.
// The passcode check, the 30-day cookie and the protection of the files are on the server (api/decks.ts, middleware.ts).
// The deck and film are added at build time from an encrypted bundle (scripts/decks-media.mjs), never this public repo,
// and the passcode is not in this page's code: the server returns it only to visitors who typed it, for the share message.
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, TextInput, View } from 'react-native';
import { Screen } from '@/components/chrome';
import { CinematicPhoto, GoldRule } from '@/components/decor';
import { Seo } from '@/components/seo';
import { Button, Container, Eyebrow, Serif, T, useWide } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { SITE_URL } from '@/lib/images';
import { colors } from '@/theme';

const API = '/api/decks';
const PAGE = `${SITE_URL}/decks`;
const FILM = {
  hd: '/decks/film/al-mukarramah-film-1080p.mp4',
  sd: '/decks/film/al-mukarramah-film-720p.mp4',
  poster: '/decks/film/poster.jpg',
  file: 'Al-Mukarramah-film.mp4',
};
const DECK = '/decks/deck';

type Phase = 'checking' | 'locked' | 'open';

/** Where to go after unlocking, if the visitor arrived from a deck link (only paths inside /decks/). */
function nextPath(): string | null {
  if (typeof window === 'undefined') return null;
  const n = new URLSearchParams(window.location.search).get('next');
  return n && /^\/decks\/[A-Za-z0-9/_.-]+$/.test(n) && !n.includes('..') ? n : null;
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

export default function Decks() {
  const { t, isRTL } = useI18n();
  const wide = useWide();
  const web = Platform.OS === 'web';
  const [phase, setPhase] = useState<Phase>('checking');
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filmReady, setFilmReady] = useState<boolean | null>(null);
  const [canShare, setCanShare] = useState(false);

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

  // Once open, check the film is in this build (it is added from the private bundle at build time).
  useEffect(() => {
    if (phase !== 'open') return;
    fetch(FILM.hd, { method: 'HEAD', credentials: 'same-origin' })
      .then((r) => setFilmReady(r.ok))
      .catch(() => setFilmReady(false));
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
      } else setError(r.status === 401 ? t('decksWrong') : t('decksError'));
    } catch {
      setError(t('decksError'));
    } finally {
      setBusy(false);
    }
  };

  const lock = async () => {
    await fetch(API, { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    setCode(null);
    setFilmReady(null);
    setPhase('locked');
  };

  const codeLine = code ? t('decksShareCode').replace('{code}', code) : '';
  const message = code ? `${t('decksShareLine')}\n${PAGE}\n${codeLine}` : '';
  const enc = encodeURIComponent;
  const targets = useMemo(() => [
    { key: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${enc(message)}` },
    { key: 'linkedin', label: 'LinkedIn', href: `https://www.linkedin.com/feed/?shareActive=true&text=${enc(message)}`, copy: true },
    { key: 'x', label: 'X', href: `https://twitter.com/intent/tweet?text=${enc(message)}` },
    { key: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(PAGE)}`, copy: true },
    { key: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${enc(PAGE)}&text=${enc(`${t('decksShareLine')}\n${codeLine}`)}` },
    { key: 'email', label: t('decksEmail'), href: `mailto:?subject=${enc(t('decksShareSubject'))}&body=${enc(message)}` },
  ], [message, codeLine, t]);

  const share = async (target: { href: string; copy?: boolean }) => {
    // Facebook and LinkedIn may not keep a prepared message, so it is also copied, ready to paste.
    if (target.copy && (await copyText(message))) setNote(t('decksCopiedPaste'));
    if (target.href.startsWith('mailto:')) window.location.href = target.href;
    else window.open(target.href, '_blank', 'noopener,noreferrer');
  };

  const shareMore = async () => {
    try {
      await navigator.share({ title: t('decksShareSubject'), text: `${t('decksShareLine')}\n${codeLine}`, url: PAGE });
    } catch {
      /* the visitor closed the share sheet */
    }
  };

  const copyMessage = async () => {
    if (await copyText(message)) setNote(t('decksCopied'));
  };

  const seo = (
    <Seo
      title="The Al Mukarramah story | Private preview"
      description="The Al Mukarramah pitch deck and film: a premium marketplace and apps, for every Muslim home. Private: enter the passcode you were given."
      path="/decks"
      image="/images/decks-share.jpg"
      noindex
    />
  );

  // The iPhone and Android apps send visitors to the website, where the film and deck play.
  if (!web) {
    return (
      <Screen>
        {seo}
        <View style={{ gap: 14, paddingTop: 24 }}>
          <Eyebrow>{t('decksKicker')}</Eyebrow>
          <Serif size={34} role="h1">{t('decksTitle')}</Serif>
          <T size={15} lh={1.6} color={colors.body}>{t('decksAppOnly')}</T>
          <Button label="almukarramah.com/decks" onPress={() => Linking.openURL(PAGE)} />
        </View>
      </Screen>
    );
  }

  const intro = (
    <View style={{ gap: wide ? 16 : 12, maxWidth: 520 }}>
      <Eyebrow rule>{t('decksKicker')}</Eyebrow>
      <Serif size={wide ? 58 : 38} role="h1">{t('decksTitle')}</Serif>
      <T size={wide ? 17 : 15.5} lh={1.65} color={colors.body}>{t('decksIntro')}</T>
    </View>
  );

  const passcodeForm = (
    <View style={{ gap: 10, maxWidth: 420, marginTop: wide ? 30 : 22 }}>
      <T w={600} size={11} caps color={colors.brassText}>{t('decksPasscode')}</T>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
        <TextInput
          value={typed}
          onChangeText={(v) => { setTyped(v); setError(null); }}
          onSubmitEditing={unlock}
          inputMode="numeric"
          keyboardType="number-pad"
          autoComplete="off"
          autoCorrect={false}
          maxLength={16}
          accessibilityLabel={t('decksPasscode')}
          placeholder="• • • • •"
          placeholderTextColor={colors.muted}
          style={{
            flex: 1, minHeight: 52, paddingHorizontal: 18, borderWidth: 1, borderRadius: 2,
            borderColor: error ? colors.danger : colors.inputLine, backgroundColor: colors.white,
            color: colors.ink, fontSize: 22, letterSpacing: 8, textAlign: 'center', writingDirection: 'ltr',
          }}
        />
        <Button label={busy ? t('decksChecking') : t('decksUnlock')} onPress={unlock} busy={busy} disabled={!typed.trim()} size="lg" />
      </View>
      {error ? <T size={13} w={500} color={colors.danger}>{error}</T> : <T size={13} color={colors.muted}>{t('decksPasscodeHint')}</T>}
    </View>
  );

  return (
    <Screen padded={false}>
      {seo}
      {phase !== 'open' ? (
        // Locked: the homepage's quiet wall and its perfume in the light, with the passcode beside it.
        wide ? (
          <View style={{ minHeight: 600, backgroundColor: colors.sand, overflow: 'hidden' }}>
            <CinematicPhoto uri={isRTL ? '/images/hero-light-rtl.jpg' : '/images/hero-light.jpg'} position={isRTL ? 'left' : 'right'} sweep={false} />
            <Container style={{ flex: 1, justifyContent: 'center', paddingVertical: 72 }}>
              {intro}
              {phase === 'checking' ? <ActivityIndicator color={colors.brass} style={{ marginTop: 34, alignSelf: 'flex-start' }} /> : passcodeForm}
            </Container>
          </View>
        ) : (
          <>
            <View style={{ aspectRatio: 1170 / 1080, backgroundColor: colors.sand, overflow: 'hidden' }}>
              <CinematicPhoto uri={isRTL ? '/images/hero-phone-rtl.jpg' : '/images/hero-phone.jpg'} sweep={false} />
            </View>
            <Container style={{ paddingTop: 30, paddingBottom: 48 }}>
              {intro}
              {phase === 'checking' ? <ActivityIndicator color={colors.brass} style={{ marginTop: 26, alignSelf: 'flex-start' }} /> : passcodeForm}
            </Container>
          </>
        )
      ) : (
        <>
          {/* Open: the screening room. */}
          <View style={{ backgroundColor: colors.night }}>
            <Container style={{ paddingTop: wide ? 64 : 36, paddingBottom: wide ? 72 : 40, gap: wide ? 28 : 20 }}>
              <View style={{ gap: 10, alignItems: wide ? 'center' : 'flex-start' }}>
                <Eyebrow color={colors.goldBright}>{t('decksKicker')}</Eyebrow>
                <Serif size={wide ? 48 : 32} color={colors.goldSoft} role="h1" center={wide}>{t('decksTitle')}</Serif>
              </View>
              <View style={{ width: '100%', maxWidth: 1120, alignSelf: 'center', borderWidth: 1, borderColor: colors.goldLine, padding: wide ? 6 : 3 }}>
                <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                  {filmReady === false ? (
                    <T size={15} color={colors.onNightSoft} center style={{ paddingHorizontal: 24 }}>{t('decksFilmSoon')}</T>
                  ) : (
                    <video controls playsInline preload="metadata" poster={FILM.poster} style={{ width: '100%', height: '100%', display: 'block', background: '#000' }}>
                      <source src={FILM.sd} type="video/mp4" media="(max-width: 760px)" />
                      <source src={FILM.hd} type="video/mp4" />
                    </video>
                  )}
                </View>
              </View>
              <T size={13} color={colors.onNightFaint} center={wide}>{t('decksFilmNote')}</T>
            </Container>
          </View>

          <Container style={{ paddingTop: wide ? 56 : 36, paddingBottom: wide ? 80 : 56, gap: wide ? 48 : 36 }}>
            <View style={{ flexDirection: wide ? 'row' : 'column', gap: wide ? 48 : 32 }}>
              <View style={{ flex: 1, gap: 12 }}>
                <Serif size={wide ? 32 : 26} role="h2">{t('decksDeck')}</Serif>
                <T size={15} lh={1.65} color={colors.body}>{t('decksDeckBody')}</T>
                <a href={DECK} target="_blank" rel="noopener" style={{ textDecoration: 'none', alignSelf: 'flex-start', marginTop: 8 }}>
                  <View style={{ minHeight: 52, paddingHorizontal: 30, backgroundColor: colors.emerald, justifyContent: 'center', borderRadius: 2 }}>
                    <T w={600} size={isRTL ? 15 : 12.5} caps color={colors.white}>{t('decksOpenDeck')}</T>
                  </View>
                </a>
              </View>
              <View style={{ flex: 1, gap: 12 }}>
                <Serif size={wide ? 32 : 26} role="h2">{t('decksFilm')}</Serif>
                <T size={15} lh={1.65} color={colors.body}>{t('decksDownloadBody')}</T>
                {filmReady !== false && (
                  <a href={FILM.hd} download={FILM.file} style={{ textDecoration: 'none', alignSelf: 'flex-start', marginTop: 8 }}>
                    <View style={{ minHeight: 52, paddingHorizontal: 30, borderWidth: 1, borderColor: colors.navy, justifyContent: 'center', borderRadius: 2 }}>
                      <T w={600} size={isRTL ? 15 : 12.5} caps color={colors.navy}>{t('decksDownload')}</T>
                    </View>
                  </a>
                )}
              </View>
            </View>

            <GoldRule />

            <View style={{ gap: 14 }}>
              <Serif size={wide ? 32 : 26} role="h2">{t('decksShare')}</Serif>
              <T size={15} lh={1.6} color={colors.body}>{t('decksShareBody')}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
                {targets.map((s) => <SharePill key={s.key} label={s.label} onPress={() => share(s)} />)}
                <SharePill label={t('decksCopy')} onPress={copyMessage} />
                {canShare && <SharePill label={t('decksMore')} onPress={shareMore} />}
              </View>
              <View accessibilityLiveRegion="polite" style={{ minHeight: 22 }}>
                {note ? <T size={13} w={500} color={colors.success}>{note}</T> : null}
              </View>
              <View style={{ backgroundColor: colors.sandSoft, padding: 16, borderLeftWidth: isRTL ? 0 : 2, borderRightWidth: isRTL ? 2 : 0, borderColor: colors.gold }}>
                <T size={13.5} lh={1.6} color={colors.body} style={{ writingDirection: isRTL ? 'rtl' : 'ltr' }}>{message}</T>
              </View>
            </View>

            <View style={{ flexDirection: wide ? 'row' : 'column', justifyContent: 'space-between', gap: 12, alignItems: wide ? 'center' : 'flex-start' }}>
              <T size={13} color={colors.muted}>{t('decksPrivate')}</T>
              <Pressable accessibilityRole="button" onPress={lock} style={{ minHeight: 44, justifyContent: 'center' }}>
                <T w={600} size={11} caps color={colors.brassText}>{t('decksLock')}</T>
              </Pressable>
            </View>
          </Container>
        </>
      )}
    </Screen>
  );
}

function SharePill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44, paddingHorizontal: 18, justifyContent: 'center', borderRadius: 999,
        borderWidth: 1, borderColor: colors.goldLine, backgroundColor: pressed ? colors.goldSoft : colors.white,
      })}>
      <T w={600} size={12.5} color={colors.navy}>{label}</T>
    </Pressable>
  );
}
