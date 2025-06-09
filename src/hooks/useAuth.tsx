
import { useState, useEffect, createContext, useContext } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  userRole: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    // Ensure loading is true when the effect runs or re-runs.
    // setLoading(true); // Re-evaluating if this is needed since loading is true initially and effect runs once.

    const fetchUserRole = async (userId: string) => {
      // setLoading(true); // Ensure loading is true before starting to fetch role
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();
        if (error) throw error;
        setUserRole(data?.role || null);
      } catch (error) {
        console.error('Error fetching user role:', error);
        setUserRole(null);
      }
      // setLoading(false); // Set loading false after role is fetched or error handled
      // This ^^^ was a thought, but setLoading(false) should be tied to the overall auth + role process,
      // not just fetchUserRole completion in isolation. The current placement is better.
    };

    let initialSessionFetched = false;
    let authStateChanged = false;

    const handleAuthStateResolved = () => {
      // This function is called after either initial session or auth state change has processed user and role.
      // Only set loading to false if both initial paths have had a chance to run or if one definitively concludes.
      // Given Supabase's behavior, onAuthStateChange often handles the initial state.
      // The current setup where each async path calls setLoading(false) is robust enough.
      // The goal is to ensure it's false *after* user and role are settled.
      setLoading(false);
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // setLoading(true); // Considered, but might flicker if rapidly changing.
        const currentUser = session?.user ?? null;
        setUser(currentUser);
        setSession(session);

        if (currentUser) {
          await fetchUserRole(currentUser.id);
        } else {
          setUserRole(null);
        }
        authStateChanged = true;
        handleAuthStateResolved(); // Call after processing
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(async ({ data: { session: initialSession } }) => {
      // setLoading(true); // Considered, but might flicker.
      // This block primarily handles the case where onAuthStateChange might not have fired yet
      // or for an immediate check. With Supabase, onAuthStateChange usually fires on listener attachment.
      // We only process this if the main listener hasn't already set the user.
      if (!authStateChanged) { // Simple way to avoid redundant processing if onAuthStateChange fired first
        const currentUser = initialSession?.user ?? null;
        setUser(currentUser);
        setSession(initialSession);

        if (currentUser) {
          await fetchUserRole(currentUser.id);
        } else {
          setUserRole(null);
        }
      }
      initialSessionFetched = true;
      if (!authStateChanged) { // If onAuthStateChange hasn't run yet, this path concludes loading.
          handleAuthStateResolved();
      }
      // If authStateChanged is true, onAuthStateChange's call to handleAuthStateResolved will manage setLoading.
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUserRole(null); // Clear user role on sign out
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, userRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return { ...context, userRole: context.userRole };
}
