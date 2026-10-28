import type { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

type SessionState = {
  session: Session | null;
  staffRole: string | null;
  loading: boolean;
};

const Ctx = createContext<SessionState>({ session: null, staffRole: null, loading: true });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ session: null, staffRole: null, loading: true });

  useEffect(() => {
    const load = async (session: Session | null) => {
      let staffRole: string | null = null;
      if (session) {
        const { data } = await supabase.from('staff_members').select('role').eq('user_id', session.user.id).maybeSingle();
        staffRole = data?.role ?? null;
      }
      setState({ session, staffRole, loading: false });
    };
    supabase.auth.getSession().then(({ data }) => load(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => load(session));
    return () => sub.subscription.unsubscribe();
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);
