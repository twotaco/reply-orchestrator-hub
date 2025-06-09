
import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  role: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    const updateUserRole = async (currentSession: Session | null) => {
      setUser(currentSession?.user ?? null);
      setSession(currentSession);

      if (currentSession?.user) {
        try {
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('roles')
            .eq('id', currentSession.user.id)
            .single();

          if (error || !profile) {
            console.warn('Error fetching profile or profile not found:', error);
            setRole(null);
          } else {
            setRole(profile.roles as string | null);
          }
        } catch (e) {
          console.warn('Exception fetching profile:', e);
          setRole(null);
        } finally {
          setLoading(false);
        }
      } else {
        setRole(null);
        setLoading(false);
      }
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        await updateUserRole(session);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await updateUserRole(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null); // Clear role on sign out
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, role }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
