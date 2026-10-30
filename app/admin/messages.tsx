// Staff: conversations between customers and sellers. Flagged ones (someone asked to deal outside Al Mukarramah) first;
// our team can read any conversation and write in it.
import React, { useState } from 'react';
import { View } from 'react-native';
import { Inbox } from '@/components/conversation';
import { Screen } from '@/components/chrome';
import { Seo } from '@/components/seo';
import { Chip, H1, Notice, T, useHydrated } from '@/components/ui';
import { adminThreads } from '@/lib/aftersale';
import { MARKET_DEMO } from '@/lib/flags';
import { colors } from '@/theme';

export default function AdminMessages() {
  const [flagged, setFlagged] = useState(true);
  const hydrated = useHydrated();
  return (
    <Screen chrome="none" style={{ maxWidth: 1180 }}>
      <Seo title="Admin | Conversations" description="Staff only." path="/admin/messages" noindex />
      <H1>Conversations</H1>
      <T size={14} lh={1.6} color={colors.muted} style={{ marginBottom: 12, maxWidth: 820 }}>
        Contact details are masked before messages are stored. A conversation is flagged when someone asks to deal outside the platform; the kinds of details
        found are shown under each message.
      </T>
      {MARKET_DEMO ? <Notice text="Example data for the screenshots: nothing here is real or saved." /> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Chip label="Flagged" active={flagged} onPress={() => setFlagged(true)} />
        <Chip label="All recent" active={!flagged} onPress={() => setFlagged(false)} />
      </View>
      {hydrated ? <Inbox key={String(flagged)} side="staff" list={() => adminThreads(flagged)} emptyText="Nothing here." /> : null}
    </Screen>
  );
}
