import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { UserProfile } from '../types';
import {
  fetchCurrentUserProfile,
  isSupabaseConfigured,
  signOutUser,
  supabase,
} from '../lib/supabase';

interface AuthContextValue {
  userId: string | null;
  profile: UserProfile | null;
  isLoadingAuth: boolean;
  isSupabaseReady: boolean;
  refreshProfile: () => Promise<UserProfile | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  userId: null,
  profile: null,
  isLoadingAuth: false,
  isSupabaseReady: false,
  refreshProfile: async () => null,
  signOut: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isSupabaseReady = isSupabaseConfigured();
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(isSupabaseReady);

  const loadUserProfile = useCallback(async (uid: string | null): Promise<UserProfile | null> => {
    if (!uid) {
      setProfile(null);
      return null;
    }
    const p = await fetchCurrentUserProfile(uid);
    setProfile(p);
    return p;
  }, []);

  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id || null;
    setUserId(uid);
    return loadUserProfile(uid);
  }, [loadUserProfile]);

  useEffect(() => {
    if (!supabase) {
      setIsLoadingAuth(false);
      return;
    }

    let mounted = true;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!mounted) return;
        const uid = data.session?.user?.id || null;
        setUserId(uid);
        if (uid) {
          await loadUserProfile(uid);
        }
        if (mounted) setIsLoadingAuth(false);
      })
      .catch(() => {
        if (mounted) setIsLoadingAuth(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      const uid = session?.user?.id || null;
      setUserId(uid);
      if (uid) {
        await loadUserProfile(uid);
      } else {
        setProfile(null);
      }
      setIsLoadingAuth(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadUserProfile]);

  const handleSignOut = async () => {
    await signOutUser();
    setUserId(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        userId,
        profile,
        isLoadingAuth,
        isSupabaseReady,
        refreshProfile,
        signOut: handleSignOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
