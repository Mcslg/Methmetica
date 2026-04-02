import { useEffect } from 'react';
import useStore from '../store/useStore';
import { buildAppUserFromSession, getCurrentSession, onAuthStateChange } from '../integrations/supabase/auth';
import { isSupabaseConfigured } from '../integrations/supabase/client';

export function AuthBootstrap() {
  const setUser = useStore(state => state.setUser);
  const setAuthStatus = useStore(state => state.setAuthStatus);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!isSupabaseConfigured) {
        setAuthStatus('anonymous');
        return;
      }

      setAuthStatus('loading');
      try {
        const session = await getCurrentSession();
        const appUser = await buildAppUserFromSession(session);
        if (cancelled) return;
        setUser(appUser);
        setAuthStatus(appUser ? 'authenticated' : 'anonymous');
      } catch (error) {
        console.error('Failed to bootstrap auth', error);
        if (cancelled) return;
        setAuthStatus('error');
      }
    }

    void boot();

    const subscription = onAuthStateChange(async (appUser) => {
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

