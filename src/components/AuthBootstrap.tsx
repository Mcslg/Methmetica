import { useEffect } from 'react';
import useStore from '../store/useStore';
import { onAuthStateChange } from '../integrations/supabase/auth';
import { isSupabaseConfigured } from '../integrations/supabase/client';
import type { AppUser } from '../integrations/supabase/types';

const preserveVerifiedRoleOnFallback = (current: AppUser | null, next: AppUser | null) => {
  if (!current || !next || current.id !== next.id) return next;
  if (next.roleSource !== 'fallback') return next;
  if (current.role === 'user' || current.roleSource === 'fallback') return next;

  return {
    ...next,
    role: current.role,
    roleSource: current.roleSource,
  };
};

export function AuthBootstrap() {
  const setUser = useStore(state => state.setUser);
  const setAuthStatus = useStore(state => state.setAuthStatus);

  useEffect(() => {
    let cancelled = false;

    if (!isSupabaseConfigured) {
      setAuthStatus('anonymous');
      return () => {
        cancelled = true;
      };
    }

    setAuthStatus('loading');
    const subscription = onAuthStateChange((appUser) => {
      if (cancelled) return;
      setUser(preserveVerifiedRoleOnFallback(useStore.getState().user, appUser));
      setAuthStatus(appUser ? 'authenticated' : 'anonymous');
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setAuthStatus, setUser]);

  return null;
}
