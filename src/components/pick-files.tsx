// A file picker button (web). On phones the seller dashboard asks people to add files from the website.
import React, { useRef } from 'react';
import { Platform, View } from 'react-native';
import { Icon } from './icons';
import { Button } from './ui';

export function PickFiles({ onFiles, label, disabled, accept = 'image/jpeg,image/png,image/webp', multiple = true, kind = 'secondary' }: {
  onFiles: (f: File[]) => void; label: string; disabled?: boolean; accept?: string; multiple?: boolean; kind?: 'secondary' | 'quiet';
}) {
  const ref = useRef<HTMLInputElement | null>(null);
  if (Platform.OS !== 'web') return null;
  return (
    <View>
      {React.createElement('input', {
        ref, type: 'file', accept, multiple, style: { display: 'none' },
        onChange: (e: { target: HTMLInputElement }) => { const fl = Array.from(e.target.files ?? []); e.target.value = ''; if (fl.length) onFiles(fl); },
      })}
      <Button label={label} kind={kind} size="sm" disabled={disabled} onPress={() => ref.current?.click()} icon={kind === 'secondary' ? <Icon name="plus" size={16} /> : undefined} />
    </View>
  );
}
