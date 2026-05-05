import { useEffect } from 'react';
import useStore from '../store/useStore';
import { onAuthStateChange } from '../integrations/supabase/auth';
import { isSupabaseConfigured } from '../integrations/supabase/client';

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
      setUser(appUser);
      setAuthStatus(appUser ? 'authenticated' : 'anonymous');
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [setAuthStatus, setUser]);

  return null;
}
