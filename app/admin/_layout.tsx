import { Redirect, Stack } from 'expo-router';
import React from 'react';
import { Loading, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';
import { colors } from '@/theme';

/** Backup admin screens. Day-to-day work is done from Claude; this is for emergencies and quick checks. */
export default function AdminLayout() {
  const { session, staffRole, loading } = useSession();
  if (loading) return <Screen><Loading /></Screen>;
  if (!session || !staffRole) return <Redirect href="/account" />;
  return <Stack screenOptions={{ headerTintColor: colors.navy, title: 'Admin' }} />;
}
