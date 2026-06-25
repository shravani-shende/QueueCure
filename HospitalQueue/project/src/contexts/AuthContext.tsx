import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Profile } from '../lib/types';
import { api, setAuthToken, getAuthToken } from '../lib/api';

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  session: { token: string } | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<{ token: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    setSession({ token });
    api.me()
      .then(data => {
        setUser(data.user);
        setProfile(data.profile);
      })
      .catch(() => {
        setAuthToken(null);
        setSession(null);
        setUser(null);
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, []);

  async function signIn(email: string, password: string) {
    try {
      const data = await api.login(email, password);
      setAuthToken(data.token);
      setSession({ token: data.token });
      setUser(data.user);
      setProfile(data.profile);
      return { error: null };
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Unable to sign in' };
    }
  }

  async function signOut() {
    await api.logout().catch(() => undefined);
    setAuthToken(null);
    setSession(null);
    setUser(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
