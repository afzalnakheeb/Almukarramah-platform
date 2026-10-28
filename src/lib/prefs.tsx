import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

/** Where the shopper wants delivery. It shapes the header, product availability lines and the checkout defaults. */
export type Destination = 'madinah-hotel' | 'makkah-hotel' | 'saudi' | 'international';
export const DESTINATIONS: Destination[] = ['madinah-hotel', 'makkah-hotel', 'saudi', 'international'];

type Prefs = { destination: Destination; setDestination: (d: Destination) => void };

const Ctx = createContext<Prefs>({ destination: 'saudi', setDestination: () => undefined });

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [destination, setDest] = useState<Destination>('saudi');
  useEffect(() => {
    AsyncStorage.getItem('destination').then((v) => {
      if (v && DESTINATIONS.includes(v as Destination)) setDest(v as Destination);
    }).catch(() => undefined);
  }, []);
  const value = useMemo<Prefs>(() => ({
    destination,
    setDestination: (d) => {
      setDest(d);
      AsyncStorage.setItem('destination', d).catch(() => undefined);
    },
  }), [destination]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePrefs = () => useContext(Ctx);
