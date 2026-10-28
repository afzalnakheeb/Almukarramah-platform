import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Alert, I18nManager, Platform } from 'react-native';
import type { Lang } from './types';

const en = {
  appName: 'Al Mukarramah',
  tagline: 'Gifts from Madinah, delivered with care',
  occasionTitle: "What's the occasion?",
  forWhom: 'Who is it for?',
  byBudget: 'Gifts by budget',
  under: 'Under',
  featured: 'Chosen for you',
  shop: 'Shop',
  home: 'Home',
  cart: 'Bag',
  account: 'Account',
  addToBag: 'Add to bag',
  outOfStock: 'Out of stock',
  notToCountry: 'Cannot be sent to your country',
  bagEmpty: 'Your bag is empty',
  subtotal: 'Subtotal',
  shipping: 'Delivery',
  total: 'Total',
  vatIncluded: 'Includes 15% VAT',
  checkout: 'Checkout',
  deliverTo: 'Deliver to',
  home_: 'Home',
  hotel: 'Hotel',
  office: 'Office',
  recipientName: 'Recipient name',
  phone: 'Phone',
  country: 'Country (2 letters, e.g. SA)',
  city: 'City',
  address: 'Street and building',
  hotelName: 'Hotel name',
  checkIn: 'Check-in date (YYYY-MM-DD)',
  checkOut: 'Check-out date (YYYY-MM-DD)',
  giftMessage: 'Gift message (optional)',
  partnerCode: 'Hotel or creator code (optional)',
  getRates: 'See delivery options',
  pay: 'Pay securely',
  payNote: 'mada, Apple Pay, STC Pay and cards through Moyasar',
  days: 'days',
  signIn: 'Sign in',
  email: 'Email',
  sendCode: 'Email me a sign-in link',
  checkEmail: 'Check your email for the sign-in link.',
  signOut: 'Sign out',
  myOrders: 'My orders',
  membership: 'Membership',
  quranTrail: 'Quran Trail',
  seerahTrail: 'Seerah Trail',
  concierge: 'Gift concierge',
  askConcierge: 'Ask for a gift idea…',
  send: 'Send',
  language: 'العربية',
  currency: 'Currency',
  storeClosed: 'The store is closed for a short time. Please come back soon.',
  join: 'Join',
  perMonth: 'a month',
  membersOnly: 'For members',
  admin: 'Admin',
  restartForLanguage: 'Close and reopen the app to switch layout direction.',
  invoice: 'Tax invoice',
};

const ar: typeof en = {
  appName: 'المكرمة',
  tagline: 'هدايا من المدينة المنورة، تصلك بعناية',
  occasionTitle: 'ما هي المناسبة؟',
  forWhom: 'لمن الهدية؟',
  byBudget: 'هدايا حسب الميزانية',
  under: 'أقل من',
  featured: 'اخترناها لك',
  shop: 'المتجر',
  home: 'الرئيسية',
  cart: 'الحقيبة',
  account: 'حسابي',
  addToBag: 'أضف إلى الحقيبة',
  outOfStock: 'نفدت الكمية',
  notToCountry: 'لا يمكن شحنه إلى بلدك',
  bagEmpty: 'حقيبتك فارغة',
  subtotal: 'المجموع الفرعي',
  shipping: 'التوصيل',
  total: 'الإجمالي',
  vatIncluded: 'يشمل ضريبة القيمة المضافة ١٥٪',
  checkout: 'إتمام الطلب',
  deliverTo: 'التوصيل إلى',
  home_: 'المنزل',
  hotel: 'الفندق',
  office: 'المكتب',
  recipientName: 'اسم المستلم',
  phone: 'رقم الجوال',
  country: 'الدولة (حرفان، مثل SA)',
  city: 'المدينة',
  address: 'الشارع والمبنى',
  hotelName: 'اسم الفندق',
  checkIn: 'تاريخ الوصول (YYYY-MM-DD)',
  checkOut: 'تاريخ المغادرة (YYYY-MM-DD)',
  giftMessage: 'رسالة الهدية (اختياري)',
  partnerCode: 'رمز الفندق أو صانع المحتوى (اختياري)',
  getRates: 'عرض خيارات التوصيل',
  pay: 'ادفع بأمان',
  payNote: 'مدى وApple Pay وSTC Pay والبطاقات عبر ميسر',
  days: 'أيام',
  signIn: 'تسجيل الدخول',
  email: 'البريد الإلكتروني',
  sendCode: 'أرسل لي رابط الدخول',
  checkEmail: 'تحقق من بريدك الإلكتروني لرابط الدخول.',
  signOut: 'تسجيل الخروج',
  myOrders: 'طلباتي',
  membership: 'العضوية',
  quranTrail: 'رحلة القرآن',
  seerahTrail: 'رحلة السيرة',
  concierge: 'مساعد الهدايا',
  askConcierge: 'اطلب فكرة هدية…',
  send: 'إرسال',
  language: 'English',
  currency: 'العملة',
  storeClosed: 'المتجر مغلق لفترة قصيرة. نرجو العودة قريبًا.',
  join: 'اشترك',
  perMonth: 'شهريًا',
  membersOnly: 'للأعضاء',
  admin: 'الإدارة',
  restartForLanguage: 'أغلق التطبيق وافتحه مجددًا لتغيير اتجاه الصفحة.',
  invoice: 'فاتورة ضريبية',
};

export type Key = keyof typeof en;

type I18n = {
  lang: Lang;
  isRTL: boolean;
  t: (k: Key) => string;
  setLang: (l: Lang) => void;
  currency: string;
  setCurrency: (c: string) => void;
  /** pick the Arabic or English field of a record */
  pick: <T extends Record<string, unknown>>(row: T, field: string) => string;
};

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const device = getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
  const [lang, setLangState] = useState<Lang>(device);
  const [currency, setCurrencyState] = useState('SAR');

  useEffect(() => {
    AsyncStorage.multiGet(['lang', 'currency']).then((pairs) => {
      const l = pairs[0][1];
      const c = pairs[1][1];
      if (l === 'ar' || l === 'en') setLangState(l);
      if (c) setCurrencyState(c);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const value = useMemo<I18n>(() => ({
    lang,
    isRTL: lang === 'ar',
    t: (k) => (lang === 'ar' ? ar : en)[k],
    setLang: (l) => {
      setLangState(l);
      AsyncStorage.setItem('lang', l);
      if (Platform.OS !== 'web' && I18nManager.isRTL !== (l === 'ar')) {
        I18nManager.allowRTL(true);
        I18nManager.forceRTL(l === 'ar');
        Alert.alert((l === 'ar' ? ar : en).restartForLanguage);
      }
    },
    currency,
    setCurrency: (c) => {
      setCurrencyState(c);
      AsyncStorage.setItem('currency', c);
    },
    pick: (row, field) => String(row[`${field}_${lang}`] ?? row[`${field}_en`] ?? ''),
  }), [lang, currency]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
