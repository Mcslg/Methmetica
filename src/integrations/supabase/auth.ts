import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './client';
import type { AppProfile, AppRole, AppUser } from './types';
import { withSupabaseTimeout } from './utils';

const makeFallbackAvatar = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=0f766e&color=fff&bold=true`;

export const profileToAppUser = (user: User, profile: AppProfile | null): AppUser => {
  const name =
    profile?.display_name ||
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'User';
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || null;

  return {
    id: user.id,
    email: user.email || profile?.email || '',
    name,
    avatarUrl,
    fallbackAvatar: makeFallbackAvatar(name),
    role: profile?.role || 'user',
    authProvider: 'supabase-google',
  };
};

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Supabase is not configured.');

  const redirectTo = window.location.origin;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });

  if (error) throw error;
}

export async function signOutSupabase() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function buildAppUserFromSession(session: Session | null): Promise<AppUser | null> {
  if (!session?.user) return null;
  return profileToAppUser(session.user, null);
}

export async function getUserRole(userId: string): Promise<AppRole> {
  if (!supabase) return 'user';

  try {
    const { data, error } = await withSupabaseTimeout(
      supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle(),
      'Loading user role'
    );

    if (error) {
      throw error;
    }

    return (data?.role as AppRole | undefined) || 'user';
    } catch (error) {
      console.warn('[auth] getUserRole fallback to user:', error);
      return 'user';
    }
}

export function onAuthStateChange(callback: (user: AppUser | null) => Promise<void> | void) {
  if (!supabase || !isSupabaseConfigured) {
    return { unsubscribe() { } };
  }

  const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
    try {
      const appUser = await buildAppUserFromSession(session);
      await callback(appUser);
    } catch (error) {
      console.error('[auth] onAuthStateChange error:', event, error);

      if (event === 'INITIAL_SESSION' && session?.user) {
        const fallbackUser = profileToAppUser(session.user, null);
        await callback(fallbackUser);
      }
    }
  });

  return {
    unsubscribe() {
      data.subscription.unsubscribe();
    },
  };
}
