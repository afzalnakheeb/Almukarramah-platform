// "Ask Al Mukarramah": the floating assistant on every page, and the chat body shared with the /concierge page.
import { router, usePathname, type Href } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '@/components/icons';
import { data } from '@/components/motion';
import { Notice, Photo, Serif, T, useWide } from '@/components/ui';
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
        <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: mine ? colors.stone : colors.porcelain, borderRadius: 2, paddingVertical: 12, paddingHorizontal: 15, borderWidth: 1, borderColor: mine ? colors.stone : colors.line, borderStartColor: mine ? colors.stone : colors.gold }}>
          <T size={14.5} lh={1.6} color={colors.ink}>{m.content}</T>
        </View>
        {m.products?.map((p) => (
          <Pressable key={p.slug} accessibilityRole="link" onPress={() => go(`/product/${p.slug}`)}
            style={{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: colors.porcelain, borderWidth: 1, borderColor: colors.line, borderRadius: 2, padding: 8 }}>
            <View style={{ width: 52 }}><Photo uri={p.image} ratio={1} fit="cover" tone={p.image ? colors.sand : toneFor(p.slug)} /></View>
            <View style={{ flex: 1, gap: 3 }}>
              <T w={500} size={13.5} color={colors.navy} numberOfLines={2}>{p.name}</T>
              <T size={13} num w={500} color={colors.body}>{money(p.price_sar)}</T>
            </View>
            <Icon name={isRTL ? 'chevronLeft' : 'chevronRight'} size={16} stroke={1.3} color={colors.brass} />
          </Pressable>
        ))}
        {m.action && <ActionCard turn={m} index={i} go={go} />}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderColor: colors.goldLine, backgroundColor: colors.ivory }}>
        <View style={{ width: 38, height: 38, borderRadius: 999, borderWidth: 1, borderColor: colors.gold, backgroundColor: colors.porcelain, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="sparkle" size={17} stroke={1.3} color={colors.emerald} />
        </View>
        <View style={{ flex: 1, gap: 1 }}>
          <Serif size={21}>{t('assistantTitle')}</Serif>
          <T size={12} color={colors.muted}>{t('assistantSub')}</T>
        </View>
        {a.turns.length > 0 && (
          <Pressable accessibilityRole="button" onPress={a.reset} {...data({ foot: 1 })} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
            <T size={10.5} w={600} caps color={colors.navy} style={{ textDecorationLine: 'underline' }}>{t('newChat')}</T>
          </Pressable>
        )}
        {onClose && (
          <Pressable accessibilityRole="button" accessibilityLabel={t('close')} onPress={onClose} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={19} stroke={1.3} />
          </Pressable>
        )}
      </View>

      <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: colors.ivory }} contentContainerStyle={{ padding: 18, gap: 14 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled">
        {bubble({ role: 'assistant', content: t(HELLO[a.page.kind] ?? 'assistantHello_home') }, -1)}
        {a.turns.map(bubble)}
        {a.busy && (
          <View style={{ alignSelf: 'flex-start', backgroundColor: colors.porcelain, borderRadius: 2, paddingVertical: 10, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.line }}>
            <T color={colors.muted}>{t('assistantThinking')}</T>
          </View>
        )}
        {a.error && <Notice tone="warn" text={a.error} />}
        {a.turns.length === 0 && !a.busy && (
          <View style={{ gap: 8, marginTop: 4 }}>
            {chips.map((k) => (
              <Pressable key={k} accessibilityRole="button" onPress={() => submit(t(k))} {...data({ chip: 'off' })}
                style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.porcelain, borderRadius: 1, paddingVertical: 9, paddingHorizontal: 14 }}>
                <T size={13.5} color={colors.navy}>{t(k)}</T>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={{ padding: 14, gap: 8, backgroundColor: colors.porcelain, borderTopWidth: 1, borderColor: colors.line }}>
        <View {...data({ search: 1 })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.inputLine, borderRadius: 1, backgroundColor: colors.ivory, paddingStart: 16, paddingEnd: 5, minHeight: 50 }}>
          <TextInput
            accessibilityLabel={t('askConcierge')}
            placeholder={t('askConcierge')}
            placeholderTextColor={colors.muted}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={() => submit()}
            returnKeyType="send"
            maxLength={1200}
            style={[sans(400, isRTL), { flex: 1, fontSize: 15.5, color: colors.ink, minHeight: 42, textAlign: isRTL ? 'right' : 'left', outlineStyle: 'none' } as never]}
          />
          <Pressable accessibilityRole="button" accessibilityLabel={t('send')} onPress={() => submit()} disabled={a.busy || !input.trim()}
            {...data({ btn: input.trim() ? 'primary' : undefined })}
            style={{ width: 40, height: 40, borderRadius: 1, borderWidth: 1, borderColor: input.trim() ? colors.emerald : colors.disabled, backgroundColor: input.trim() ? colors.emerald : colors.disabled, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }}><Icon name="send" size={16} stroke={1.4} color={input.trim() ? colors.ivory : colors.muted} /></View>
          </Pressable>
        </View>
        <T size={11} color={colors.muted} center>{t('assistantPrivacy')}</T>
      </View>
    </View>
  );
}

function ActionCard({ turn, index, go }: { turn: Turn; index: number; go: (p: string) => void }) {
  const { t } = useI18n();
  const a = useAssistant();
  const act = turn.action!;
  const [note, setNote] = useState<string | null>(null);
  const box = { backgroundColor: colors.porcelain, borderWidth: 1, borderColor: colors.line, borderTopColor: colors.gold, borderRadius: 2, padding: 14, gap: 10 } as const;
  const btn = (label: string, onPress: () => void, done?: boolean) => (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={done}
      {...data({ btn: done ? undefined : 'primary' })}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: done ? colors.emeraldSoft : colors.emerald, borderWidth: 1, borderColor: done ? colors.emeraldSoft : colors.emerald, borderRadius: 1, paddingVertical: 9, paddingHorizontal: 16 }}>
      {done && <Icon name="check" size={14} stroke={1.8} color={colors.success} />}
      <T size={10.5} w={600} caps color={done ? colors.success : colors.ivory}>{label}</T>
    </Pressable>
  );

  if (act.type === 'gift_message') {
    return (
      <View style={box}>
        <T size={10} w={600} caps color={colors.brassText}>{t('giftMessage')}</T>
        <Serif size={20} style={{ lineHeight: 28 }}>“{act.text}”</Serif>
        {btn(turn.applied ? t('messageUsed') : t('useMessage'), () => a.apply(index), turn.applied)}
      </View>
    );
  }
  if (act.type === 'fill_checkout') {
    const rows = Object.entries(act.fields).filter(([k]) => k !== 'kind');
    return (
      <View style={box}>
        {act.fields.kind && <T size={10} w={600} caps color={colors.brassText}>{t(act.fields.kind === 'home' ? 'home_' : act.fields.kind)}</T>}
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
      {...data({ btn: 'primary' })}
      style={[fixed, side, { bottom, zIndex: 60, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.emerald, borderRadius: 999, height: 52, width: 52, borderWidth: 1, borderColor: colors.gold, shadowColor: '#1C1A17', shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6 }]}>
      <Icon name={a.open && wide ? 'close' : 'sparkle'} size={19} color={colors.ivory} stroke={1.3} />
    </Pressable>
  );

  if (wide) {
    return (
      <>
        {a.open && (
          <View style={[fixed, side, { bottom: bottom + 68, zIndex: 61, width: 400, height: Math.min(640, height - bottom - 100), backgroundColor: colors.ivory, borderRadius: 2, overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderTopColor: colors.gold, shadowColor: '#1C1A17', shadowOpacity: 0.14, shadowRadius: 36, shadowOffset: { width: 0, height: 14 }, elevation: 12 }]}>
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
        <View style={{ flex: 1, paddingTop: web ? 0 : Math.max(insets.top - 30, 0), paddingBottom: insets.bottom, backgroundColor: colors.ivory }}>
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
    <Pressable accessibilityRole="button" onPress={() => a.setOpen(true)} {...data({ caps: 1 })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingVertical: 6, borderBottomWidth: 1, borderColor: colors.goldLine }}>
      <Icon name="sparkle" size={14} stroke={1.3} color={colors.emerald} />
      <T w={600} size={11} caps color={colors.navy}>{label}</T>
    </Pressable>
  );
}
