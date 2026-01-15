import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { api } from "@/lib/api";

type AppRole = "admin" | "user";

interface User {
  id: string;
  email: string;
}

interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface AuthContextType {
  user: User | null;
  session: { access_token: string } | null;
  profile: Profile | null;
  role: AppRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, username?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserData = useCallback(async () => {
    try {
      const { data, error } = await api.getMe();
      
      if (error || !data) {
        // Token invalid or expired
        api.logout();
        setUser(null);
        setSession(null);
        setProfile(null);
        setRole(null);
        return;
      }

      setUser(data.user);
      setSession({ access_token: api.getToken() || '' });
      setProfile(data.profile);
      setRole(data.role as AppRole);
    } catch (error) {
      console.error("Error fetching user data:", error);
      api.logout();
      setUser(null);
      setSession(null);
      setProfile(null);
      setRole(null);
    }
  }, []);

  useEffect(() => {
    // Check for existing token on mount
    const token = api.getToken();
    if (token) {
      fetchUserData().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [fetchUserData]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await api.login(email, password);
    
    if (error) {
      return { error: new Error(error) };
    }
    
    if (data) {
      setUser(data.user);
      setSession({ access_token: data.token });
      setProfile(data.profile);
      setRole(data.role as AppRole);
    }
    
    return { error: null };
  };

  const signUp = async (email: string, password: string, username?: string) => {
    const { data, error } = await api.signup(email, password, username);
    
    if (error) {
      return { error: new Error(error) };
    }
    
    if (data) {
      setUser(data.user);
      setSession({ access_token: data.token });
      setProfile(data.profile);
      setRole(data.role as AppRole);
    }
    
    return { error: null };
  };

  const signOut = async () => {
    api.logout();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
  };

  const value = {
    user,
    session,
    profile,
    role,
    loading,
    signIn,
    signUp,
    signOut,
    isAdmin: role === "admin",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
