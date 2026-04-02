export type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous' | 'error';

export type AppRole = 'user' | 'trusted_editor' | 'admin';

export type AppUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
  role: AppRole;
  authProvider: 'supabase-google' | 'legacy-google-drive';
  fallbackAvatar?: string;
};

export type AppProfile = {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: AppRole;
  created_at?: string;
  updated_at?: string;
};

