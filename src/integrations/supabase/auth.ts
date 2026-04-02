import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './client';
import type { AppProfile, AppUser } from './types';

const makeFallbackAvatar = (name: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'User')}&background=0f766e&color=fff&bold=true`;

const profileToAppUser = (user: User, profile: AppProfile | null): AppUser => {
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

export async function ensureProfile(user: User): Promise<AppProfile | null> {
  if (!supabase) return null;

  const { data: existing, error: fetchError } = await supabase
    .from('profiles')
    .select('id, email, display_name, avatar_url, role, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (existing) return existing as AppProfile;

  const payload = {
    id: user.id,
    email: user.email || '',
    display_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User',
    avatar_url: user.user_metadata?.avatar_url || null,
    role: 'user',
  };

  const { data: created, error: insertError } = await supabase
    .from('profiles')
    .insert(payload)
    .select('id, email, display_name, avatar_url, role, created_at, updated_at')
    .single();

  if (insertError) throw insertError;
  return created as AppProfile;
}

export async function buildAppUserFromSession(session: Session | null): Promise<AppUser | null> {
  if (!session?.user) return null;
  const profile = await ensureProfile(session.user);
  return profileToAppUser(session.user, profile);
}

export function onAuthStateChange(callback: (user: AppUser | null) => Promise<void> | void) {
  if (!supabase || !isSupabaseConfigured) {
    return { unsubscribe() {} };
  }

  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    const appUser = await buildAppUserFromSession(session);
    await callback(appUser);
  });

  return {
    unsubscribe() {
      data.subscription.unsubscribe();
    },
  };
}

