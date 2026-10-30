// "Report this reply" under the assistant's answers, in the apps (Google Play's AI-generated content policy asks that
// people can flag offensive AI output without leaving the app). Reports go to assistant_reports (migration 0011),
// which only staff can read.
import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { T } from '@/components/ui';
import { useI18n } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

export function ReportReply({ reply, question, page }: { reply: string; question?: string; page?: string }) {
  const { t, lang } = useI18n();
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'failed'>('idle');
  if (state === 'done' || state === 'failed') {
    return <T size={11.5} color={colors.muted}>{t(state === 'done' ? 'aiReported' : 'aiReportFailed')}</T>;
  }
  return (
    <Pressable accessibilityRole="button" disabled={state === 'busy'} style={{ alignSelf: 'flex-start', paddingVertical: 2 }}
      onPress={async () => {
        setState('busy');
        const { error } = await supabase.from('assistant_reports').insert({
          reply: reply.slice(0, 4000), question: question?.slice(0, 1200) ?? null, page: page?.slice(0, 200) ?? null, lang,
        });
        setState(error ? 'failed' : 'done');
      }}>
      <T size={11.5} color={colors.muted} style={{ textDecorationLine: 'underline' }}>{t('aiReport')}</T>
    </Pressable>
  );
}
