// Country picker: type to search, names shown in the visitor's language (English or Arabic).
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';
import { Field, T } from './ui';

// ISO 3166-1 alpha-2 codes. Names come from the browser or phone (Intl.DisplayNames).
export const COUNTRY_CODES = ('AE AF AL AM AO AR AT AU AZ BA BD BE BF BG BH BJ BN BR BY CA CF CH CI CL CM CN CO CY CZ DE DJ DK DZ EC EE EG ER ES ET FI FR GA GB GE GH GM GN GR GW HK HR HU ID IE IL IN IQ IR IS IT JO JP KE KG KH KM KR KW KZ LB LK LR LT LU LV LY MA MD ME MK ML MM MN MR MT MU MV MW MX MY MZ NE NG NL NO NP NZ OM PE PH PK PL PS PT QA RO RS RU RW SA SD SE SG SI SK SL SN SO SS SY TD TG TH TJ TM TN TR TZ UA UG US UZ VN XK YE ZA ZM ZW').split(' ');

export function countryName(code: string, lang: 'en' | 'ar'): string {
  try {
    const dn = new (Intl as unknown as { DisplayNames: new (l: string[], o: { type: string }) => { of: (c: string) => string } }).DisplayNames([lang], { type: 'region' });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}

export function CountryPicker({ label, value, onChange, error }: { label: string; value: string; onChange: (code: string) => void; error?: string | null }) {
  const { lang, t } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const list = useMemo(() => COUNTRY_CODES.map((c) => ({ c, n: countryName(c, lang) })).sort((a, b) => a.n.localeCompare(b.n, lang)), [lang]);
  const shown = q.trim() ? list.filter((x) => x.n.toLowerCase().includes(q.trim().toLowerCase()) || x.c.toLowerCase() === q.trim().toLowerCase()) : list;
  return (
    <View style={{ marginBottom: 14 }}>
      <Field
        label={label}
        value={open ? q : value ? `${countryName(value, lang)} (${value})` : ''}
        placeholder={t('searchCountry')}
        onFocus={() => { setOpen(true); setQ(''); }}
        onChangeText={(v) => { setOpen(true); setQ(v); }}
        error={error}
      />
      {open && (
        <View style={{ marginTop: -8, borderWidth: 1, borderColor: colors.inputLine, borderRadius: 12, backgroundColor: colors.white, maxHeight: 220 }}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {shown.slice(0, 60).map((x) => (
              <Pressable key={x.c} accessibilityRole="button" onPress={() => { onChange(x.c); setOpen(false); setQ(''); }}
                style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: colors.lineSoft, backgroundColor: x.c === value ? colors.goldSoft : colors.white }}>
                <T size={14}>{x.n} <T size={12} color={colors.muted}>{x.c}</T></T>
              </Pressable>
            ))}
            {!shown.length && <T size={13} color={colors.muted} style={{ padding: 12 }}>{t('noCountryMatch')}</T>}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
