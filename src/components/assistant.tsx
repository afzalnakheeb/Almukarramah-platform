// "Ask Al Mukarramah": the floating assistant on every page, and the chat body shared with the /concierge page.
import { router, usePathname, type Href } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { Notice, Photo, T, useWide } from '@/components/ui';
import { useAssistant, type PageKind, type Turn } from '@/lib/assistant';
import { useI18n, type Key } from '@/lib/i18n';
import { convertFromSar, formatMoney } from '@/lib/money';
import { colors, sans, toneFor } from '@/theme';

const HELLO: Partial<Record<PageKind, Key>> = {
  product: 'assistantHello_product', cart: 'assistantHello_cart', checkout: 'assistantHello_checkout',
  account: 'assistantHello_account', membership: 'assistantHello_membership', trail: 'assistantHello_trail',
};
const CHIPS: Partial<Record<PageKind, Key[]>> = {
  product: ['sug_product_1', 'sug_product_2', 'sug_product_3'],
  cart: ['sug_cart_1', 'sug_cart_2', 'sug_cart_3'],
  checkout: ['sug_checkout_1', 'sug_checkout_2', 'sug_checkout_3'],
};
const FIELD_LABEL: Record<string, Key> = {
  recipient_name: 'recipientName', phone: 'phone', hotel_name: 'hotelName', check_in: 'checkIn', check_out: 'checkOut',
  city: 'city', country: 'country', line1: 'address',
};

/** The conversation itself: greeting, messages, suggestions and the input. */
export function AssistantChat({ onClose, compact }: { onClose?: () => void; compact?: boolean }) {
  const { t, lang, isRTL, currency } = useI18n();
  const a = useAssistant();
  const [input, setInput] = useState('');
  const scroll = useRef<ScrollView>(null);
  const money = (sar: number) => formatMoney(convertFromSar(sar, currency), currency, lang);
  const chips: Key[] = CHIPS[a.page.kind] ?? ['sug_home_1', 'sug_home_2', 'sug_home_3'];

  const submit = (text = input) => {
    if (!text.trim() || a.busy) return;
    a.send(text);
    setInput('');
  };

  const go = (path: string) => {
    router.push(path as Href);
    if (compact) onClose?.();
  };

  const bubble = (m: Turn, i: number) => {
    const mine = m.role === 'user';
    return (
      <View key={i} style={{ gap: 8 }}>
        <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: mine ? colors.navy : colors.white, borderRadius: 18, borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6, paddingVertical: 11, paddingHorizontal: 14, borderWidth: mine ? 0 : 1, borderColor: colors.line }}>
          <T size={14.5} lh={1.55} color={mine ? colors.white : colors.ink}>{m.content}</T>
        </View>
        {m.products?.map((p) => (
          <Pressable key={p.slug} accessibilityRole="link" onPress={() => go(`/product/${p.slug}`)}
            style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 8 }}>
            <View style={{ width: 52 }}><Photo uri={p.image} ratio={1} fit="contain" tone={p.image ? colors.white : toneFor(p.slug)} style={{ borderRadius: 12 }} /></View>
            <View style={{ flex: 1, gap: 2 }}>
              <T w={700} size={13.5} numberOfLines={2}>{p.name}</T>
              <T size={13} color={colors.brassText} w={700}>{money(p.price_sar)}</T>
            </View>
            <Icon name={isRTL ? 'chevronLeft' : 'chevronRight'} size={18} />
          </Pressable>
        ))}
        {m.action && <ActionCard turn={m} index={i} go={go} />}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.line, backgroundColor: colors.white }}>
        <View style={{ width: 36, height: 36, borderRadius: 999, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sparkle" size={18} color={colors.champagne} />
        </View>
        <View style={{ flex: 1 }}>
          <T w={700} size={15} color={colors.navy}>{t('assistantTitle')}</T>
          <T size={12} color={colors.muted}>{t('assistantSub')}</T>
        </View>
        {a.turns.length > 0 && (
          <Pressable accessibilityRole="button" onPress={a.reset} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
            <T size={13} w={700} color={colors.navy} style={{ textDecorationLine: 'underline' }}>{t('newChat')}</T>
          </Pressable>
        )}
        {onClose && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={20} />
          </Pressable>
        )}
      </View>

      <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: '#F7F3EC' }} contentContainerStyle={{ padding: 14, gap: 12 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
        {bubble({ role: 'assistant', content: t(HELLO[a.page.kind] ?? 'assistantHello_home') }, -1)}
        {a.turns.map(bubble)}
        {a.busy && (
          <View style={{ alignSelf: 'flex-start', backgroundColor: colors.white, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line }}>
            <T color={colors.muted}>{t('assistantThinking')}</T>
          </View>
        )}
        {a.error && <Notice tone="warn" text={a.error} />}
        {a.turns.length === 0 && !a.busy && (
          <View style={{ gap: 8, marginTop: 4 }}>
            {chips.map((k) => (
              <Pressable key={k} accessibilityRole="button" onPress={() => submit(t(k))}
                style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.champagne, backgroundColor: colors.white, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 }}>
                <T size={13.5} w={600} color={colors.navy}>{t(k)}</T>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={{ padding: 12, gap: 6, backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.inputLine, borderRadius: 999, paddingStart: 16, paddingEnd: 5, minHeight: 50 }}>
          <TextInput
            accessibilityLabel={t('askConcierge')}
            placeholder={t('askConcierge')}
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => submit()}
            returnKeyType="send"
            maxLength={1200}
            style={[sans(400, isRTL), { flex: 1, fontSize: 16, color: colors.ink, minHeight: 42, textAlign: isRTL ? 'right' : 'left' }]}
          />
          <Pressable accessibilityRole="button" accessibilityLabel={t('send')} onPress={() => submit()} disabled={a.busy || !input.trim()}
            style={{ width: 40, height: 40, borderRadius: 999, backgroundColor: input.trim() ? colors.navy : colors.disabled, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}><Icon name="send" size={17} color={colors.white} /></View>
          </Pressable>
        </View>
        <T size={11.5} color={colors.muted} center>{t('assistantPrivacy')}</T>
      </View>
    </View>
  );
}

function ActionCard({ turn, index, go }: { turn: Turn; index: number; go: (p: string) => void }) {
  const { t } = useI18n();
  const a = useAssistant();
  const act = turn.action!;
  const [note, setNote] = useState<string | null>(null);
  const box = { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.champagne, borderRadius: 16, padding: 12, gap: 10 } as const;
  const btn = (label: string, onPress: () => void, done?: boolean) => (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={done}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: done ? colors.lavender : colors.navy, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 16 }}>
      {done && <Icon name="check" size={15} color={colors.success} />}
      <T size={13.5} w={700} color={done ? colors.success : colors.white}>{label}</T>
    </Pressable>
  );

  if (act.type === 'gift_message') {
    return (
      <View style={box}>
        <T size={12} w={700} color={colors.brassText}>{t('giftMessage')}</T>
        <T size={15} lh={1.6} style={{ fontStyle: 'italic' }}>“{act.text}”</T>
        {btn(turn.applied ? t('messageUsed') : t('useMessage'), () => a.apply(index), turn.applied)}
      </View>
    );
  }
  if (act.type === 'fill_checkout') {
    const rows = Object.entries(act.fields).filter(([k]) => k !== 'kind');
    return (
      <View style={box}>
        {act.fields.kind && <T size={12} w={700} color={colors.brassText}>{t(act.fields.kind === 'home' ? 'home_' : act.fields.kind)}</T>}
        {rows.map(([k, v]) => (
          <View key={k} style={{ flexDirection: 'row', gap: 8 }}>
            <T size={13} color={colors.muted} style={{ width: 110 }}>{FIELD_LABEL[k] ? t(FIELD_LABEL[k]) : k}</T>
            <T size={13.5} w={600} style={{ flex: 1 }}>{v}</T>
          </View>
        ))}
        {a.canFill
          ? btn(turn.applied ? t('formFilled') : t('fillForm'), () => a.apply(index), turn.applied)
          : (
            <>
              {note && <T size={12.5} color={colors.muted}>{note}</T>}
              {btn(t('goToCheckout'), () => { setNote(t('fillAfterOpen')); go('/checkout'); })}
            </>
          )}
      </View>
    );
  }
  return <View style={box}>{btn(t('openPage'), () => go(act.path))}</View>;
}

/** The floating button and panel, mounted once for the whole app. */
export function AssistantDock() {
  const { t, isRTL } = useI18n();
  const a = useAssistant();
  const wide = useWide();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const pathname = usePathname();
  const web = Platform.OS === 'web';

  // Close the phone panel when the shopper navigates (e.g. taps a suggested product).
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current !== pathname && !wide) a.setOpen(false);
    last.current = pathname;
  }, [pathname, wide]); // eslint-disable-line react-hooks/exhaustive-deps

  if (pathname.startsWith('/admin') || pathname.startsWith('/concierge')) return null;

  const tabs = !web && ['home', 'shop', 'cart', 'account'].includes(a.page.kind);
  const stickyBar = !wide && a.page.kind === 'product';
  const bottom = (tabs ? 64 : 0) + (stickyBar ? 84 : 0) + insets.bottom + 18;
  const side = isRTL ? { left: wide ? 28 : 16 } : { right: wide ? 28 : 16 };
  const fixed = (web ? { position: 'fixed' } : { position: 'absolute' }) as unknown as { position: 'absolute' };

  const fab = (
    <Pressable accessibilityRole="button" accessibilityLabel={t('assistantOpen')} onPress={() => a.setOpen(!a.open)}
      style={[fixed, side, { bottom, zIndex: 60, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.navy, borderRadius: 999, height: 54, paddingHorizontal: wide ? 20 : 0, width: wide ? undefined : 54, justifyContent: 'center', borderWidth: 2, borderColor: colors.champagne, shadowColor: '#0B1030', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 }]}>
      <Icon name={a.open && wide ? 'close' : 'sparkle'} size={20} color={colors.champagne} />
      {wide && <T w={700} size={14.5} color={colors.white}>{t('assistantOpen')}</T>}
    </Pressable>
  );

  if (wide) {
    return (
      <>
        {a.open && (
          <View style={[fixed, side, { bottom: bottom + 66, zIndex: 61, width: 400, height: Math.min(640, height - bottom - 100), backgroundColor: colors.white, borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, shadowColor: '#0B1030', shadowOpacity: 0.22, shadowRadius: 30, shadowOffset: { width: 0, height: 12 }, elevation: 12 }]}>
            <AssistantChat onClose={() => a.setOpen(false)} />
          </View>
        )}
        {fab}
      </>
    );
  }
  return (
    <>
      {!a.open && fab}
      <Modal visible={a.open} animationType="slide" onRequestClose={() => a.setOpen(false)} presentationStyle={web ? undefined : 'pageSheet'}>
        <View style={{ flex: 1, paddingTop: web ? 0 : Math.max(insets.top - 30, 0), paddingBottom: insets.bottom, backgroundColor: colors.white }}>
          <AssistantChat compact onClose={() => a.setOpen(false)} />
        </View>
      </Modal>
    </>
  );
}

/** A button that opens the assistant from inside a page (e.g. "Write it for me" in the bag). */
export function AskAssistant({ label }: { label: string }) {
  const a = useAssistant();
  return (
    <Pressable accessibilityRole="button" onPress={() => a.setOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6 }}>
      <Icon name="sparkle" size={16} color={colors.brass} />
      <T w={700} size={14} color={colors.navy} style={{ textDecorationLine: 'underline' }}>{label}</T>
    </Pressable>
  );
}
